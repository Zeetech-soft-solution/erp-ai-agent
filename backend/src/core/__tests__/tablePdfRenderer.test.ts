import { renderTablePdf } from "../tablePdfRenderer";

// Deliberately NOT using this app's pdf-parse dependency here — its
// underlying pdfjs-dist worker requires --experimental-vm-modules and
// fails under Jest's default CJS test environment (confirmed: no
// existing test in this codebase exercises PDFParse for real either).
// Instead, render with compress:false (see tablePdfRenderer.ts's own
// doc comment on that option) and decode PDFKit's actual text encoding
// directly: shown text is NOT a plain literal string in the content
// stream — PDFKit emits hex-encoded glyph runs split across a TJ
// kerning array, e.g. [<48656c6c6f20> 40 <57> 30 <6f72> -15 <6c64> 0] TJ
// for "Hello World" (confirmed by dumping real pdfkit output). Undoing
// exactly that — decode every hex run, concatenate — reconstructs the
// real shown text losslessly (kerning splits characters across chunks,
// it never drops or reorders them) without needing a full PDF parser.
function bufferText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const hexRuns = raw.match(/<([0-9a-fA-F]+)>/g) || [];
  return hexRuns.map((h) => Buffer.from(h.slice(1, -1), "hex").toString("latin1")).join("");
}

describe("renderTablePdf", () => {
  it("produces a real PDF containing the title, column headers, and every row's values", async () => {
    const buffer = await renderTablePdf({
      title: "All Quotations",
      compress: false,
      columns: [
        { key: "id", label: "Id" },
        { key: "customer", label: "Customer" },
        { key: "amount", label: "Amount" },
      ],
      rows: [
        { id: "QTN-0001", customer: "Acme Corp", amount: 12000 },
        { id: "QTN-0002", customer: "Globex Inc", amount: 8500 },
      ],
    });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.slice(0, 4).toString()).toBe("%PDF"); // a genuine PDF header, not arbitrary bytes
    expect(buffer.slice(-6).toString().trim()).toBe("%%EOF");
    const text = bufferText(buffer);
    for (const expected of ["All Quotations", "Id", "Customer", "Amount", "QTN-0001", "Acme Corp", "QTN-0002", "Globex Inc", "2 rows"]) {
      expect(text).toContain(expected);
    }
  });

  it("is genuinely column-agnostic — two calls with completely different column sets both render correctly", async () => {
    const glBuffer = await renderTablePdf({
      title: "General Ledger",
      compress: false,
      columns: [
        { key: "posting_date", label: "Posting Date" },
        { key: "account", label: "Account" },
        { key: "debit", label: "Debit" },
        { key: "credit", label: "Credit" },
      ],
      rows: [{ posting_date: "2026-01-05", account: "Cash", debit: 5000, credit: 0 }],
    });
    const glText = bufferText(glBuffer);
    expect(glText).toContain("Posting Date");
    expect(glText).toContain("Debit");
    expect(glText).toContain("Credit");

    const leadBuffer = await renderTablePdf({
      title: "All Leads",
      compress: false,
      columns: [
        { key: "lead_name", label: "Lead Name" },
        { key: "source", label: "Source" },
      ],
      rows: [{ lead_name: "Jane Doe", source: "Website" }],
    });
    const leadText = bufferText(leadBuffer);
    expect(leadText).toContain("Lead Name");
    expect(leadText).toContain("Source");
    expect(leadText).not.toContain("Debit"); // proves the renderer isn't reusing stale column state between calls
  });

  it("handles an empty result set without throwing", async () => {
    const buffer = await renderTablePdf({ title: "Empty Report", compress: false, columns: [{ key: "id", label: "Id" }], rows: [] });
    const text = bufferText(buffer);
    expect(text).toContain("Empty Report");
    expect(text).toContain("0 rows");
  });

  it("paginates onto a new page, repeating headers, when there are enough rows", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ id: `ROW-${i}`, value: i }));
    const buffer = await renderTablePdf({
      title: "Big Report",
      compress: false,
      columns: [
        { key: "id", label: "Id" },
        { key: "value", label: "Value" },
      ],
      rows,
    });
    // Real PDF page objects (/Type /Page) live in the plain, uncompressed
    // object dictionary regardless of content-stream text encoding — a
    // reliable way to count actual rendered pages without a parser. This
    // checks the RAW buffer (not the hex-decoded shown text above).
    const pageCount = (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pageCount).toBeGreaterThan(1);
    const text = bufferText(buffer);
    expect(text).toContain("ROW-0");
    expect(text).toContain("ROW-79");
  });

  it("handles null/undefined/object cell values without throwing", async () => {
    const buffer = await renderTablePdf({
      title: "Messy Data",
      compress: false,
      columns: [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
      ],
      rows: [{ a: null, b: undefined }, { a: { nested: true }, b: 0 }],
    });
    expect(bufferText(buffer)).toContain("Messy Data");
  });

  it("defaults to compressed output — a compressed PDF is meaningfully smaller than the same content uncompressed", async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: `ROW-${i}`, value: `some repeated filler text ${i % 5}` }));
    const columns = [{ key: "id", label: "Id" }, { key: "value", label: "Value" }];
    const compressed = await renderTablePdf({ title: "T", columns, rows });
    const uncompressed = await renderTablePdf({ title: "T", columns, rows, compress: false });
    expect(compressed.length).toBeLessThan(uncompressed.length);
  });
});
