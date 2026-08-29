import { MCPModule } from "../../core/types";
import { REPORT_CONFIGS } from "../../config/reports.config";
import { ENTITY_CONFIGS } from "../../config/entities.config";

/**
 * Same discipline as modules/documents/index.ts's document.get_pdf, one
 * level up: a full/all/exported report can be thousands of rows, and
 * this app's whole point with big data is that raw rows never reach the
 * LLM's own context (see reportGenerator.ts's doc comment, and the
 * routing rule in reasoningEngine.ts that steers "give me all X" /
 * "export"/"full report" asks here instead of *.list or *.report.*).
 *
 * EXPLICIT RULE: this handler NEVER calls systemConnector, NEVER fetches
 * a row, NEVER imports reportGenerator.ts. It only builds a URL string.
 * The actual fetch + PDF render happens later, lazily, only when that
 * URL is requested (GET /api/agent/report-pdf, agent.routes.ts) — at
 * which point the response is streamed straight to the HTTP client, not
 * routed back through this tool call or the model's context at all.
 */
// Exported for relayReasoningEngine.ts's own report.generate dispatch —
// the SAME real known-key sets, never a second copy that could drift.
export const KNOWN_REPORT_KEYS = new Set(REPORT_CONFIGS.map((r) => r.reportKey));
export const KNOWN_ENTITY_KEYS = new Set(ENTITY_CONFIGS.map((e) => e.entityKey));

export const reportsModule: MCPModule = {
  name: "report_generate",
  description: "Generate downloadable PDF report. Use for ALL data / EXPORT / DOWNLOAD.",
  tools: [
    {
      // 2026-08-23, explicit user request: description cut to a
      // one-liner — the "when to reach for this vs .list/execute_query"
      // decision is already TOOL_DISCOVERY's own "'All'/'Download' →
      // report.generate" line, sent every turn.
      name: "report.generate",
      description: `PDF download for complete dataset. 3 sources:
- named_report + reportKey (profit_and_loss, general_ledger, stock_balance)
- entity_query + entityKey + filters? + columns? (full entity list)
- aggregate_query + entityKey + groupBy + op/metrics (full breakdown, no page limit)

Never use .list for "all" data. Use this instead. Returns download link only.`,
      module: "report_generate",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string", enum: ["named_report", "entity_query", "aggregate_query"] },
          reportKey: { type: "string" },
          entityKey: { type: "string" },
          filters: { type: "object" },
          columns: { type: "array", items: { type: "string" } },
          groupBy: { type: "string" },
          op: { type: "string", enum: ["sum", "avg", "count", "min", "max"] },
          field: { type: "string" },
          metrics: { type: "array", items: { type: "object", properties: { op: { type: "string", enum: ["sum", "avg", "count", "min", "max"] }, field: { type: "string" }, label: { type: "string" } }, required: ["op", "field"] } },
        },
        required: ["source"],
      },
      handler: async (args) => {
        const source = args?.source;
        if (source === "named_report") {
          if (!args?.reportKey || !KNOWN_REPORT_KEYS.has(args.reportKey)) {
            return { error: `Unknown reportKey "${args?.reportKey}". Known report keys: ${Array.from(KNOWN_REPORT_KEYS).join(", ")}` };
          }
        } else if (source === "entity_query") {
          if (!args?.entityKey || !KNOWN_ENTITY_KEYS.has(args.entityKey)) {
            return { error: `Unknown entityKey "${args?.entityKey}". Known entity keys: ${Array.from(KNOWN_ENTITY_KEYS).join(", ")}` };
          }
        } else if (source === "aggregate_query") {
          // Real, explicit scope decision (2026-08-21): this source is
          // built for the RELAY + plugin path (relayReasoningEngine.ts's
          // own buildReportSpec, dispatched entirely in-process there,
          // never reaching this handler for a relay tenant — see this
          // module's own doc comment on report.generate's relay
          // interception). The LOCAL /api/agent engine's own report-pdf
          // route (reportGenerator.ts) has no aggregate fetch path yet —
          // an honest "not yet" here is a strict improvement over either
          // a silent wrong PDF or a confusing generic validation error.
          return { error: "A full aggregate/breakdown PDF isn't available on this local engine yet — try analytics.aggregate for the computed numbers, or ask again from the plugin." };
        } else {
          return { error: 'source must be "named_report", "entity_query", or "aggregate_query"' };
        }
        const params = new URLSearchParams({ source });
        if (args.reportKey) params.set("reportKey", args.reportKey);
        if (args.entityKey) params.set("entityKey", args.entityKey);
        if (args.filters) params.set("filters", JSON.stringify(args.filters));
        if (Array.isArray(args.columns) && args.columns.length) params.set("columns", JSON.stringify(args.columns));
        // "name" is a display/filename label, not a real record id (unlike
        // document.get_pdf's, which names one actual record) — the
        // frontend's downloadFile() needs SOME filename, same as it does
        // for document.get_pdf (see ResponseView.tsx's handleDownload).
        return { report: { name: args.reportKey || args.entityKey, url: `/api/agent/report-pdf?${params.toString()}` } };
      },
    },
  ],
};
