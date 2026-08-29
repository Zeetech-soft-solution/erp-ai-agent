import PDFDocument from "pdfkit";

/**
 * Generic tabular PDF renderer — the ONE shared rendering path for both
 * report sources this app has (see reportGenerator.ts): ERPNext's own
 * named Query Reports (P&L, General Ledger, Stock Balance, ...) and
 * plain ad-hoc entity queries ("all quotations this quarter"). Both
 * reduce to the same {columns, rows} shape once fetched — this function
 * deliberately knows nothing about where the data came from, so a new
 * report source never needs a second renderer, just a new adapter that
 * produces this same shape.
 *
 * Columns are NOT fixed — every call can (and often will) pass a
 * different column set, since a General Ledger row and a Quotation row
 * share nothing. Column widths are computed dynamically per render from
 * the actual header/content lengths, never hand-tuned per report.
 *
 * Deliberately NOT reusing the frontend's jsPDF chart-drawing code
 * (chartSpecRenderer.ts) — that runs in the browser and is shaped around
 * vector chart geometry; this runs server-side, on-demand, per download
 * request, over what can be thousands of plain tabular rows. pdfkit is a
 * pure-Node, no-headless-browser dependency, which is what a text/table
 * PDF actually needs.
 */

export interface TablePdfColumn {
  key: string;
  label: string;
}

export interface TablePdfOptions {
  title: string;
  subtitle?: string;
  columns: TablePdfColumn[];
  rows: Record<string, any>[];
  // Defaults true (real PDFs should be compressed — this can be
  // thousands of rows, and pdfkit's flate compression matters at that
  // size). Exposed as false mainly for tests: it lets the generated
  // content stream be verified with a plain string/regex check on the
  // raw buffer instead of a full PDF-parsing round trip, since the
  // pdf-parse dependency this app already uses elsewhere hits an ESM/
  // worker limitation under Jest's CJS test environment.
  compress?: boolean;
}

const PAGE_MARGIN = 36;
const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 24;
const FONT_SIZE = 8;
const HEADER_FONT_SIZE = 9;
const MIN_COL_WIDTH = 50;

function formatCell(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Column widths from actual header/content lengths, scaled to fill the
 *  page width exactly — a report with 4 wide columns and one with 12
 *  narrow columns both need to look intentional, not like a fixed grid
 *  that happens to fit or overflow depending on luck. */
function computeColumnWidths(columns: TablePdfColumn[], rows: Record<string, any>[], usableWidth: number): number[] {
  const rawWidths = columns.map((col) => {
    let maxLen = col.label.length;
    for (const row of rows) {
      const len = formatCell(row[col.key]).length;
      if (len > maxLen) maxLen = len;
    }
    // Cap any single column's raw estimate so one huge free-text field
    // (e.g. a long remarks/description) doesn't starve every other
    // column down to MIN_COL_WIDTH.
    return Math.min(maxLen, 40);
  });
  const totalRaw = rawWidths.reduce((a, b) => a + b, 0) || 1;
  const scaled = rawWidths.map((w) => Math.max(MIN_COL_WIDTH, (w / totalRaw) * usableWidth));
  const scaledTotal = scaled.reduce((a, b) => a + b, 0);
  // Re-scale down proportionally if the MIN_COL_WIDTH floor pushed the
  // total past the page width (many columns, all near-minimum).
  if (scaledTotal > usableWidth) {
    const shrink = usableWidth / scaledTotal;
    return scaled.map((w) => w * shrink);
  }
  return scaled;
}

/** Renders {columns, rows} as a real paginated tabular PDF — headers
 *  repeat on every new page, columns are truncated (not wrapped) to keep
 *  row height fixed and predictable across thousands of rows. Returns
 *  the finished buffer; callers stream it straight to the response, this
 *  never writes to disk or holds report state between calls (see the
 *  route in agent.routes.ts — every request regenerates from scratch). */
export function renderTablePdf(options: TablePdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: PAGE_MARGIN,
      size: "A4",
      layout: options.columns.length > 6 ? "landscape" : "portrait",
      compress: options.compress !== false,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const usableWidth = doc.page.width - PAGE_MARGIN * 2;
    const colWidths = computeColumnWidths(options.columns, options.rows, usableWidth);

    doc.fontSize(14).text(options.title, { align: "left" });
    if (options.subtitle) doc.fontSize(9).fillColor("#555555").text(options.subtitle);
    doc.fillColor("#000000").moveDown(0.5);
    doc.fontSize(8).fillColor("#777777").text(`${options.rows.length} row${options.rows.length === 1 ? "" : "s"} — generated ${new Date().toISOString()}`);
    doc.fillColor("#000000").moveDown(0.75);

    let y = doc.y;

    const drawHeader = () => {
      let x = PAGE_MARGIN;
      doc.font("Helvetica-Bold").fontSize(HEADER_FONT_SIZE);
      options.columns.forEach((col, i) => {
        doc.text(col.label, x, y, { width: colWidths[i], height: HEADER_HEIGHT, ellipsis: true });
        x += colWidths[i];
      });
      y += HEADER_HEIGHT;
      doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + usableWidth, y).strokeColor("#cccccc").stroke();
      y += 4;
      doc.font("Helvetica").fontSize(FONT_SIZE);
    };

    drawHeader();

    for (const row of options.rows) {
      if (y + ROW_HEIGHT > doc.page.height - PAGE_MARGIN) {
        doc.addPage();
        y = PAGE_MARGIN;
        drawHeader();
      }
      let x = PAGE_MARGIN;
      options.columns.forEach((col, i) => {
        doc.text(formatCell(row[col.key]), x, y, { width: colWidths[i], height: ROW_HEIGHT, ellipsis: true });
        x += colWidths[i];
      });
      y += ROW_HEIGHT;
    }

    doc.end();
  });
}
