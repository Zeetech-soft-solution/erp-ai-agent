import { ToolDefinition } from "./types";
import { MODULE_KEYWORDS } from "../systemPrompt/modules";

export { MODULE_KEYWORDS };

const SAFE_TOOL_CAP = 120;
const TURN_TOOL_THRESHOLD = 20;

const ALWAYS_INCLUDE_MODULES = new Set(["context", "document", "meta", "utilities"]);
const ALWAYS_INCLUDE_TOOL_NAMES = new Set(["tools.search"]);

const ANALYTICS_TOOL_NAMES = new Set([
  "analytics.aggregate",
  "analytics.percentage",
  "analytics.calculate",
  "analytics.correlate",
  "chart.build",
]);
const QUERY_TOOL_NAMES = new Set([
  "data_table.list",
  "data_table.search_schema",
  "database_engine.execute_query",
]);

export function detectExplicitModules(prompt: string): Set<string> {
  const lower = prompt.toLowerCase();
  const matched = new Set<string>();

  for (const [module, keywords] of Object.entries(MODULE_KEYWORDS)) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.trim()}`);
      if (regex.test(lower)) {
        matched.add(module);
        break;
      }
    }
  }
  return matched;
}

export function detectModules(prompt: string): Set<string> {
  const matchedModules = new Set<string>(ALWAYS_INCLUDE_MODULES);
  for (const module of detectExplicitModules(prompt)) {
    matchedModules.add(module);
  }
  return matchedModules;
}

export function narrowToolsForPrompt(tools: ToolDefinition[], prompt: string): ToolDefinition[] {
  if (tools.length <= SAFE_TOOL_CAP) return tools;

  const matchedModules = detectModules(prompt);
  const narrowed = tools.filter((t) => matchedModules.has(t.module));

  if (narrowed.length > SAFE_TOOL_CAP) {
    return narrowed.slice(0, SAFE_TOOL_CAP);
  }

  if (narrowed.length === 0 && tools.length > 0) {
    const fallback = tools.filter((t) => t.module === "utilities" || t.module === "meta" || t.module === "document");
    return fallback.length > 0 ? fallback.slice(0, SAFE_TOOL_CAP) : tools.slice(0, SAFE_TOOL_CAP);
  }

  return narrowed;
}

function toolMatchesBusinessModule(tool: ToolDefinition, businessModules: Set<string>): boolean {
  if (businessModules.has(tool.module)) return true;

  if (businessModules.has("support") && (tool.module === "tickets" || tool.name.startsWith("tickets."))) return true;
  if (businessModules.has("projects") && (tool.module === "project_issue" || tool.name.startsWith("project_issue."))) return true;
  if (businessModules.has("accounting") && (tool.module === "payment_entry_actions" || tool.name.startsWith("payment_entry.") || tool.name.startsWith("accounting.report."))) return true;
  if (businessModules.has("stock") && tool.name.startsWith("stock.report.")) return true;
  if ((businessModules.has("selling") || businessModules.has("crm")) && (tool.module === "lead_qualification" || tool.name.startsWith("lead_qualification."))) return true;

  return false;
}

/**
 * RELAY per-turn tool selection (2026-08-28). Dumb and predictable:
 *
 *   spine (tools.search, data_table.list, data_table.search_schema,
 *          database_engine.execute_query)                          — always
 *   + entity tools for whatever business module the KEYWORDS matched
 *   + context lookup (tiny, harmless)
 *
 * Everything else — analytics.*, chart.build, report.generate, email.*,
 * communication.*, document.* — is DISCOVERY-ONLY: the model reaches it
 * by calling tools.search, and relayReasoningEngine.ts's tools.search
 * handler both registers the found tool names AND injects that module's
 * prompt rules into the system message. No intent regexes, no
 * cross-module guessing — if the keyword doesn't match, it's the model's
 * job to search.
 */
const RELAY_SPINE_TOOLS = new Set(["tools.search", "data_table.list", "data_table.search_schema", "database_engine.execute_query"]);

// Cross-module transaction pairs. When BOTH members keyword-match, also
// offer the "transaction-side" module's entity tools — because the
// transactional records live there, not in the party/topic module the
// keyword hit. e.g. "every customer's overdue invoices": "customers" ->
// crm, "invoices/overdue" -> accounting, but sales_invoice lives in
// SELLING. This is a tool-availability rule only — no prompt text.
const MODULE_PAIR_WIDEN: { pair: [string, string]; add: string }[] = [
  { pair: ["crm", "selling"], add: "selling" },
  { pair: ["crm", "accounting"], add: "selling" },
  { pair: ["accounting", "selling"], add: "selling" },
  { pair: ["buying", "stock"], add: "stock" },
  { pair: ["accounting", "buying"], add: "buying" },
  { pair: ["selling", "stock"], add: "stock" },
  { pair: ["manufacturing", "stock"], add: "stock" },
  { pair: ["hr", "accounting"], add: "accounting" },
];

/** The keyword-matched BUSINESS modules for a turn, plus any module a
 *  matched transaction-pair widens into (e.g. crm+accounting -> selling,
 *  because sales_invoice lives in selling). Both the tool selector and
 *  the prompt assembler consume this, so tools and rules stay in sync. */
export function relayModulesFor(prompt: string): Set<string> {
  const businessModules = new Set(
    Array.from(detectExplicitModules(prompt)).filter((m) => !ALWAYS_INCLUDE_MODULES.has(m) && m !== "analytics")
  );
  for (const { pair, add } of MODULE_PAIR_WIDEN) {
    if (businessModules.has(pair[0]) && businessModules.has(pair[1])) businessModules.add(add);
  }
  return businessModules;
}

export function selectRelayTools(tools: ToolDefinition[], prompt: string): ToolDefinition[] {
  const businessModules = relayModulesFor(prompt);

  const picked = tools.filter((t) => {
    if (RELAY_SPINE_TOOLS.has(t.name)) return true;
    if (t.module === "context") return true;
    if (businessModules.size && toolMatchesBusinessModule(t, businessModules)) return true;
    return false; // discovery-only
  });

  // A totally unmatched turn (greeting / vague) still gets the spine —
  // never an empty list.
  return picked.length ? picked : tools.filter((t) => RELAY_SPINE_TOOLS.has(t.name) || t.module === "context");
}

/**
 * Selects a small tool catalog for a clear request without changing the
 * process-wide registry or the gateway's authorization boundary. The old
 * cap-based function remains the conservative fallback for ambiguous text.
 * (Still used by the LOCAL single-tenant engine — unchanged.)
 */
export function selectToolsForTurn(tools: ToolDefinition[], prompt: string): ToolDefinition[] {
  if (tools.length <= TURN_TOOL_THRESHOLD) return tools;

  const explicitModules = detectExplicitModules(prompt);

  const isAnalytics = explicitModules.has("analytics") || /\b(chart|graph|plot|visualize|trend|pie|bar|line|correlate|calculate|sum|avg|count|min|max|percentage|growth|metric|analysis|analytics)\b/i.test(prompt);
  const isQuery = isAnalytics || /\b(join|group|query|schema|table|sql|database)\b/i.test(prompt);
  const isReport = /\b(report|export|download|statement|register|ledger|summary)\b/i.test(prompt);
  const isDoc = explicitModules.has("document") || /\b(pdf|print|download\s+pdf|get\s+pdf|document)\b/i.test(prompt);
  const isEmail = explicitModules.has("utilities") || /\b(email|mail|inbox|send|draft|reply|communication|message)\b/i.test(prompt);
  const isNotification = /\b(notification|notifications|notify|alert|unread|inbox)\b/i.test(prompt);

  const businessModules = new Set(Array.from(explicitModules).filter((m) => !ALWAYS_INCLUDE_MODULES.has(m) && m !== "analytics"));

  const hasSpecificIntent = businessModules.size > 0 || isAnalytics || isQuery || isReport || isDoc || isEmail || isNotification;
  if (!hasSpecificIntent) return tools;

  const selected = tools.filter((tool) => {
    if (ALWAYS_INCLUDE_TOOL_NAMES.has(tool.name)) return true;
    if (tool.module === "context") return true;

    if (businessModules.size && toolMatchesBusinessModule(tool, businessModules)) return true;

    if (ANALYTICS_TOOL_NAMES.has(tool.name) || tool.name.startsWith("analytics.") || tool.name.startsWith("chart.")) {
      return isAnalytics;
    }
    if (QUERY_TOOL_NAMES.has(tool.name) || tool.module === "data_server" || tool.module === "schema_search") {
      return isQuery;
    }
    if (tool.name === "report.generate" || tool.module === "report_generate") {
      return isReport;
    }
    if (tool.module === "document" || tool.name.startsWith("document.")) {
      return isDoc;
    }
    if (tool.module === "email" || tool.name.startsWith("email.") || tool.name.startsWith("communication.")) {
      return isEmail;
    }
    if (tool.name.startsWith("notification_log.")) {
      return isNotification;
    }
    if (tool.name.includes(".report.")) {
      return isReport || (businessModules.size > 0 && toolMatchesBusinessModule(tool, businessModules));
    }
    if (tool.module === "utilities") return false;
    return false;
  });

  const selectedActionableTools = selected.filter((tool) => !ALWAYS_INCLUDE_TOOL_NAMES.has(tool.name) && tool.module !== "context");
  return selectedActionableTools.length ? selected : tools;
}
