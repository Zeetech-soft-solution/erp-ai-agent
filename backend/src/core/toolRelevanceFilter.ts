import { ToolDefinition } from "./types";

/**
 * Confirmed live 2026-08-11: ANY System-Manager-level session (the CEO
 * account, Administrator — anyone whose allowed_tools is "*") got a hard
 * LLM-request failure on EVERY message, including "what's our company
 * name": "Invalid 'tools': array too long. Expected an array with
 * maximum length 128, but got an array with length 226 instead."
 * OpenAI's function-calling API caps tool definitions per request at
 * 128; this deployment's real tool count grew past that during the
 * 2026-08-09 71-entity buildout without anyone re-testing an actual LLM
 * call under a "*" session specifically (prior sessions confirmed the
 * CEO account hitting real ERPNext-side 403s at the DATA layer, which
 * only happens AFTER a successful LLM call — proof this is a genuine
 * regression introduced somewhere after that, not a pre-existing gap).
 *
 * Every real department role stays completely unaffected — this only
 * ever activates when the caller's own full tool list already exceeds
 * the safe cap, which no non-"*" role in this deployment comes close to.
 *
 * Fix: narrow to tools relevant to THIS message's topic, using each
 * tool's own `module` field (a coarse ~15-value grouping — "hr",
 * "selling", "accounting", etc. — see config/modules/*\/entities.ts) —
 * deliberately coarser than per-entity keyword matching, since a
 * business question rarely uses the exact entity name ("who's absent"
 * has no literal "attendance") but usually maps cleanly onto one
 * department/module. A small ALWAYS_INCLUDE set of cross-cutting
 * utility modules (analytics, context, document) is never dropped,
 * since almost any answer may need a calculation, past-conversation
 * context, or a PDF. If keyword matching finds nothing at all (a vague/
 * generic question), falls back to the modules a CEO persona asks about
 * most in practice (crm, selling, accounting) rather than an empty set.
 *
 * This ONLY narrows what gets sent to the LLM for tool-calling THIS
 * turn — never touches session.allowed_tools or listAllowedTools()
 * itself, so the actual permission boundary (what a "*" session is
 * really entitled to call) is completely unchanged; a query this
 * heuristic under-matches can still be answered correctly if the user
 * rephrases with a more specific term.
 */
const SAFE_TOOL_CAP = 120;

const ALWAYS_INCLUDE_MODULES = new Set(["analytics", "context", "document"]);
const FALLBACK_MODULES = new Set(["crm", "selling", "accounting"]);

const MODULE_KEYWORDS: Record<string, string[]> = {
  hr: ["employee", "staff", "leave", "absent", "attendance", "payroll", "salary", " hr ", "recruit", "applicant",
    "appraisal", "shift", "department", "designation", "expense claim", "training", "interview", "job offer"],
  selling: ["quotation", "quote", "sales order", "sale ", "sales invoice", "pos invoice", "pricing rule", "discount"],
  buying: ["purchase", "supplier", "vendor", "procurement", "rfq", "subcontract", "landed cost"],
  stock: ["stock", "inventory", "warehouse", "item ", "material request", "batch", "delivery note", "reorder",
    "bin", "reconciliation"],
  manufacturing: ["work order", "bom", "bill of material", "job card", "production", "manufactur", "workstation"],
  quality: ["quality", "inspection", "defect", "reject"],
  projects: ["project", "task", "timesheet", "hours logged"],
  assets: ["asset", "depreciation", "maintenance schedule"],
  support: ["issue", "ticket", "complaint", "support"],
  accounting: ["account", "invoice", "payment", "journal", "ledger", "expense", "revenue", "profit", "loss",
    "balance sheet", "gl entry", "cost center", "bank", "fiscal year", "trial balance", "cash flow", "outstanding"],
  crm: ["customer", "lead", "opportunity", "contact", "address", "territory"],
};

/**
 * Narrows `tools` to the ones relevant to `prompt`, ONLY when `tools`
 * already exceeds SAFE_TOOL_CAP. Returns `tools` unchanged otherwise —
 * a pure no-op for every session that isn't already over budget.
 */
export function narrowToolsForPrompt(tools: ToolDefinition[], prompt: string): ToolDefinition[] {
  if (tools.length <= SAFE_TOOL_CAP) return tools;

  const lower = prompt.toLowerCase();
  const matchedModules = new Set<string>(ALWAYS_INCLUDE_MODULES);
  for (const [module, keywords] of Object.entries(MODULE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) matchedModules.add(module);
  }
  if (matchedModules.size === ALWAYS_INCLUDE_MODULES.size) {
    for (const m of FALLBACK_MODULES) matchedModules.add(m);
  }

  const narrowed = tools.filter((t) => matchedModules.has(t.module));
  // Belt-and-suspenders: if the topic-matched set is STILL somehow over
  // the cap (a broad question matching several large modules at once),
  // truncate defensively rather than let the request fail outright —
  // better to answer with a subset than not at all.
  return narrowed.length > SAFE_TOOL_CAP ? narrowed.slice(0, SAFE_TOOL_CAP) : narrowed;
}
