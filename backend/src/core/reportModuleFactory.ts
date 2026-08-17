import { MCPModule, ToolDefinition, ReportConfig } from "./types";
import { systemConnector } from "../config/system.config";

/**
 * Generates one MCP tool per named report, calling ONLY through
 * systemConnector.runReport() — same discipline as entityModuleFactory.
 * A report is read-only by nature, always passes session.credential so
 * results respect whatever row/field-level permissions the acting
 * person has on the underlying system (ERPNext reports are permission-
 * scoped per user, not just per role).
 */
/**
 * Confirmed live 2026-08-12: chasing an intermittent "I can't access
 * the P&L report right now" — the model sometimes calls this tool with
 * from_date/to_date (etc.) as TOP-LEVEL arguments instead of properly
 * nested under "filters", the same malformed-call shape
 * normalizeListArgs() (entityModuleFactory.ts) already recovers for
 * *.list tools. Report tools had no equivalent recovery: the handler
 * below read args?.filters only, so a flat call meant runReport()
 * received filters:undefined, silently dropped period_start_date/
 * period_end_date from the ERPNext request entirely, and ERPNext threw
 * "From Date and To Date are mandatory" — a genuinely confusing error
 * for what looked, from the outside, like a random flake (reproduced
 * directly against ERPNext and via raw Node/axios with hand-built
 * requests: 100% reliable in isolation, only failing through the real
 * LLM tool-calling path — proof this was a call-shape bug, not
 * ERPNext/network flakiness). Same recovery logic as normalizeListArgs:
 * any top-level arg key that matches a real filter field name for this
 * report gets folded in; a properly-shaped filters object always wins
 * on a key collision.
 */
export function normalizeReportArgs(args: any, filterFields: string[] | undefined) {
  if (!filterFields?.length) return args?.filters;
  const strayFilters: Record<string, any> = {};
  for (const [key, value] of Object.entries(args || {})) {
    if (key === "filters" || !filterFields.includes(key)) continue;
    strayFilters[key] = value;
  }
  return Object.keys(strayFilters).length ? { ...strayFilters, ...(args?.filters || {}) } : args?.filters;
}

export function buildReportModule(config: ReportConfig): MCPModule {
  const toolName = config.toolName || `${config.module}.report.${config.reportKey}`;
  // Confirmed live 2026-08-11: "profit and loss for this month vs last
  // month" called this tool with {"filters":{"date":{"op":"relative",
  // "value":"this_month"}}} — the exact shape *.list tools use — and it
  // silently failed both calls. Report filters are NOT list filters:
  // runReport() (erpnextConnector.ts) maps each key through a flat
  // canonicalFilter -> ERPNext-key lookup and passes the VALUE straight
  // through with no {op,value}/"relative" resolution at all — an object
  // like {op:"relative",...} either matches no key (silently dropped) or
  // reaches ERPNext as a literal value it can't parse as a date. Every
  // report in reportMap.ts actually expects "from_date"/"to_date" as
  // literal ISO date strings. The bare `{type:"object"}` schema below
  // gave the model zero signal of any of this, so it reasonably reused
  // the only date convention it had ever seen — fixed the same way
  // fieldValues/linkFields closed the analogous gaps on *.list tools:
  // document the real shape instead of leaving it to be guessed.
  const filterFieldsNote = config.filterFields?.length
    ? ` Accepted canonical filter keys for this report: ${config.filterFields.join(", ")}.`
    : "";
  const tool: ToolDefinition = {
    name: toolName,
    description: config.description || `Run the "${config.reportKey}" report`,
    module: config.module,
    parameters: {
      type: "object",
      properties: {
        filters: {
          type: "object",
          description:
            "Plain key-value object — NOT the {\"op\":...,\"value\":...} shape *.list tools use, and " +
            "\"relative\"/\"between\" are NOT supported here. \"from_date\"/\"to_date\" (when accepted) must be " +
            "literal ISO date strings (YYYY-MM-DD), e.g. {\"from_date\":\"2026-08-01\",\"to_date\":\"2026-08-10\"}. " +
            "For a phrase like \"this month\"/\"last week\", use the exact literal dates from this turn's Date " +
            "hint if one was given; otherwise resolve it yourself into literal from_date/to_date — never pass a " +
            "relative keyword or an {op,value} object into a report filter." +
            filterFieldsNote,
        },
      },
    },
    handler: (args, session) =>
      systemConnector.runReport(config.reportKey, session.credential, normalizeReportArgs(args, config.filterFields)),
  };
  return { name: toolName, description: config.description || `${config.reportKey} report`, tools: [tool] };
}

export function buildReportModules(configs: ReportConfig[]): MCPModule[] {
  return configs.map(buildReportModule);
}
