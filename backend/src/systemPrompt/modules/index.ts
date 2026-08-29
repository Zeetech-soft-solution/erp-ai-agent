/**
 * MODULES INDEX - one real file per real module folder in
 * config/modules/, matching the actual 12 domains this deployment has
 * (11 real ERP business domains + "analytics", the cross-cutting
 * chart/analytics toolbox — see MODULE_KEYWORDS below). No fictional
 * modules (no "education" — nothing real backs it in this deployment).
 */
export { SELLING_MODULE } from "./selling";
export { BUYING_MODULE } from "./buying";
export { ACCOUNTING_MODULE } from "./accounting";
export { HR_MODULE } from "./hr";
export { MANUFACTURING_MODULE } from "./manufacturing";
export { SUPPORT_MODULE } from "./support";
export { PROJECTS_MODULE } from "./projects";
export { STOCK_MODULE } from "./stock";
export { ASSETS_MODULE } from "./assets";
export { CRM_MODULE } from "./crm";
export { QUALITY_MODULE } from "./quality";
export { ANALYTICS_MODULE } from "./analytics";

/**
 * MODULE_KEYWORDS - relocated here 2026-08-23 from core/toolRelevanceFilter.ts
 * (single source of truth living alongside the actual module content it
 * selects). toolRelevanceFilter.ts imports + re-exports this rather than
 * defining its own copy.
 *
 * Widened 2026-08-24 (user edit) — real common phrasings per module (e.g.
 * "sales invoice"/"delivery note" on selling, "material request"/"purchase
 * receipt" on buying, doctype-name variants like "purchase_order"), plus
 * real keyword coverage for "utilities"/"meta"/"document" (previously only
 * ever reached via ALWAYS_INCLUDE_MODULES, never keyword-matchable on their
 * own — a specific phrasing like "download pdf" or "find tool" can now
 * route there directly too, same as every business module already could).
 *
 * Analytics has its own keyword route even though analytics tools are
 * registered under the cross-cutting "utilities" tool module. This keeps
 * the detailed analytics rules conditional instead of paying their prompt
 * cost on unrelated requests.
 *
 * "hr" needs no manual padding (the old " hr " workaround) any more —
 * toolRelevanceFilter.ts's detectModules() now matches on a real leading
 * word-boundary regex, which already handles a keyword sitting at the very
 * start/end of a sentence correctly, including plurals ("items"/"sales")
 * that a padded-substring match could never have covered either way.
 */
export const MODULE_KEYWORDS: Record<string, string[]> = {
  selling: ["quotation", "sales order", "sales_order", "opportunity", "lead", "sell", "sale", "customer order", "quote", "sales invoice", "delivery note"],
  buying: ["purchase order", "purchase_order", "rfq", "request for quotation", "supplier", "vendor", "buy", "procurement", "material request", "purchase invoice", "purchase receipt", "supplier quotation"],
  stock: ["stock", "inventory", "warehouse", "bin", "movement", "transfer", "item", "items", "stock entry", "stock balance", "reorder", "quantity", "available stock"],
  accounting: ["accounting", "finance", "invoice", "payment", "journal", "journal entry", "gl", "gl entry", "p&l", "profit", "loss", "balance sheet", "outstanding", "receivable", "payable", "bank", "cash", "financial", "tax", "gst"],
  hr: ["employee", "employees", "leave", "attendance", "salary", "payroll", "expense claim", "hiring", "recruitment", "timesheet", "absent", "hr"],
  manufacturing: ["work order", "work_order", "bom", "bill of materials", "production", "manufacturing", "assembly", "routing", "operation", "produce"],
  crm: ["crm", "lead", "opportunity", "customer", "contact", "communication", "call", "meeting", "address", "customer relationship"],
  projects: ["project", "task", "milestone", "timeline", "gantt", "project management", "deliverable", "progress", "time log"],
  assets: ["asset", "depreciation", "fixed asset", "equipment", "vehicle", "machinery", "building", "disposal", "asset movement", "book value"],
  quality: ["quality", "inspection", "test", "certification", "non-conformance", "defect", "quality inspection"],
  support: ["issue", "ticket", "support", "complaint", "bug", "problem", "incident", "helpdesk", "resolve"],
  analytics: ["chart", "graph", "plot", "visualize", "trend", "pie", "bar", "line", "correlate", "calculate", "sum", "avg", "count", "min", "max", "percentage", "growth", "analysis", "analytics"],
  utilities: ["email", "notification", "report", "export"],
  meta: ["tools.search", "discover", "find tool"],
  document: ["pdf", "print", "download pdf", "get pdf"],
};
