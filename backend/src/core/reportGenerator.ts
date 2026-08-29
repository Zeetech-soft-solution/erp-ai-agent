import { systemConnector } from "../config/system.config";
import { REPORT_CONFIGS } from "../config/reports.config";
import { ENTITY_CONFIGS } from "../config/entities.config";
import { UserCredential } from "./types";
import { normalizeReportArgs } from "./reportModuleFactory";
import { renderTablePdf, TablePdfColumn } from "./tablePdfRenderer";

/**
 * The two report SOURCES this app has, unified behind one PDF output.
 * Both reduce to the same {columns, rows} shape once fetched (see
 * tablePdfRenderer.ts) — this file owns only the "how do I get the full
 * data" half, deliberately kept separate from "how do I draw it".
 *
 * EXPLICIT RULE, not just a structural accident: nothing in this file is
 * ever called from a tool handler. It's only ever reached from the
 * /report-pdf download route (agent.routes.ts) — same discipline as
 * getDocumentPdf/document.get_pdf. A tool handler that imported this
 * module and awaited generateReportPdf() directly would be a bug: the
 * whole point of report.generate (modules/reports/index.ts) is that its
 * handler NEVER runs this code and NEVER sees a row — it only builds a
 * URL string. If you're adding a new call site, it belongs in a
 * download route, not a tool handler.
 */

// Same ceiling AGGREGATE_ROW_CAP already uses in erpnextConnector.ts —
// one consistent "how much is safe to pull in a single request" number
// across the app rather than a second, independently-tuned limit that
// can drift out of sync with the first.
export const REPORT_ROW_CAP = 10000;

function humanizeLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Column set for a named-report result. runReport() already normalizes
 *  ERPNext's report payload down to plain {fieldname: value} dicts (see
 *  erpnextConnector.ts's normalizeReportResult) but discards the report's
 *  own column labels in the process — deriving labels from the row keys
 *  here (rather than plumbing ERPNext's raw column metadata all the way
 *  through) keeps this function usable for ANY future connector's report
 *  shape too, not just ERPNext's. A humanized fieldname ("Net Amount") is
 *  a reasonable v1; swap in real per-report column metadata later if a
 *  specific report's fieldnames don't humanize well. */
function columnsFromRows(rows: Record<string, any>[]): TablePdfColumn[] {
  if (!rows.length) return [];
  // Union of keys across all rows, not just row[0] — a report/entity can
  // have optional fields present on some records and absent on others;
  // using only the first row's keys would silently drop a column that
  // happens to be null/missing on that particular record.
  const keys = new Set<string>();
  for (const row of rows) Object.keys(row).forEach((k) => keys.add(k));
  return Array.from(keys).map((key) => ({ key, label: humanizeLabel(key) }));
}

export type ReportGenerateArgs =
  | { source: "named_report"; reportKey: string; filters?: Record<string, any>; columns?: string[] }
  | { source: "entity_query"; entityKey: string; filters?: Record<string, any>; columns?: string[] };

/**
 * Real, explicit product ask (2026-08-20): "when ask someone report by
 * its column... invoice by status company and amount" — explicit column
 * SELECTION, on top of the default-columns behavior columnsFromRows()
 * already gives for free when nothing is specified. `requested` is
 * whatever the caller's own `columns` arg was (canonical field names);
 * `available` is the full real set this report/entity would otherwise
 * show. Unknown/misspelled names are silently dropped rather than
 * erroring the whole report — a partial real match is a better outcome
 * than no PDF at all, and the model can always be told which of its
 * requested names didn't match via the return value if that's ever
 * surfaced. Falls back to `available` UNCHANGED when `requested` is
 * empty/undefined — "no issue if the report default whatever renders
 * let it" (explicit user instruction) — this must never behave
 * differently from before this feature existed when columns is omitted.
 */
function narrowColumns(available: TablePdfColumn[], requested?: string[]): TablePdfColumn[] {
  if (!requested || !requested.length) return available;
  const byKey = new Map(available.map((c) => [c.key, c]));
  const narrowed = requested.map((k) => byKey.get(k)).filter((c): c is TablePdfColumn => !!c);
  return narrowed.length ? narrowed : available;
}

export async function generateReportPdf(args: ReportGenerateArgs, credential: UserCredential): Promise<{ filename: string; buffer: Buffer }> {
  if (args.source === "named_report") {
    const config = REPORT_CONFIGS.find((r) => r.reportKey === args.reportKey);
    if (!config) throw new Error(`Unknown reportKey "${args.reportKey}"`);
    const rows = await systemConnector.runReport(args.reportKey, credential, normalizeReportArgs({ filters: args.filters }, config.filterFields));
    const title = humanizeLabel(config.reportKey);
    const columns = narrowColumns(columnsFromRows(rows), args.columns);
    const buffer = await renderTablePdf({ title, subtitle: config.description, columns, rows });
    return { filename: `${config.reportKey}.pdf`, buffer };
  }

  const config = ENTITY_CONFIGS.find((e) => e.entityKey === args.entityKey);
  if (!config) throw new Error(`Unknown entityKey "${args.entityKey}"`);
  // Explicit limit overrides list()'s admin-configured interactive
  // default (see erpnextConnector.ts's list()) — this is the one path in
  // the whole app allowed to ask for up to REPORT_ROW_CAP rows in one
  // call, because the result goes straight into a PDF, never into chat
  // or the LLM's context.
  const rows = await systemConnector.list(args.entityKey, credential, { filters: args.filters, limit: REPORT_ROW_CAP });
  const columns = narrowColumns(config.canonicalFields.map((key) => ({ key, label: humanizeLabel(key) })), args.columns);
  const title = `All ${humanizeLabel(args.entityKey)}s`;
  const buffer = await renderTablePdf({ title, columns, rows });
  return { filename: `${args.entityKey}_report.pdf`, buffer };
}
