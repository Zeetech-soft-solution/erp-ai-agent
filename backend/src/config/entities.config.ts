import { EntityConfig } from "../core/types";
import { CRM_ENTITIES } from "./modules/crm/entity";
import { SELLING_ENTITIES } from "./modules/selling/entity";
import { BUYING_ENTITIES } from "./modules/buying/entity";
import { STOCK_ENTITIES } from "./modules/stock/entity";
import { ACCOUNTING_ENTITIES } from "./modules/accounting/entity";
import { HR_ENTITIES } from "./modules/hr/entity";
import { MANUFACTURING_ENTITIES } from "./modules/manufacturing/entity";
import { PROJECTS_ENTITIES } from "./modules/projects/entity";
import { ASSETS_ENTITIES } from "./modules/assets/entity";
import { QUALITY_ENTITIES } from "./modules/quality/entity";
import { SUPPORT_ENTITIES } from "./modules/support/entity";

/**
 * ERP-AGNOSTIC entity list, ASSEMBLED from one file per standard ERP
 * module (config/modules/<name>/entities.ts) — the same module
 * taxonomy every mainstream ERP mirrors in some form (CRM, Selling,
 * Buying, Stock, Accounting, HR, Manufacturing, Projects...). Each
 * module's folder also holds its rules.ts and training.ts (see
 * config/rules.config.ts / config/training.config.ts) — entities,
 * rules, and training metadata for one module live in one place, even
 * though today only crm and selling have real rules/training content;
 * the rest are present as stubs awaiting pro-tier detail.
 *
 * Every entry here is canonical — no doctype names, no ERP-specific
 * field names, ever. That translation lives entirely in
 * erpnext/entityMaps/*.ts (mirrored one-to-one with these modules) and,
 * later, sap/entityMaps/*.ts — deliberately NOT moved into these
 * per-module folders, so the canonical/ERP-specific boundary stays
 * sharp. This file, roles.policy.ts, and every tool built from it stay
 * identical whether SYSTEM_PROVIDER is "erpnext" or "sap" — only the
 * per-provider entity map differs.
 *
 * To add a new module: create config/modules/<name>/entities.ts (+
 * rules.ts + training.ts) following the same shape, import + spread it
 * below, then create the matching erpnext/entityMaps/<name>.ts.
 * Nothing else changes.
 */
export const ENTITY_CONFIGS: EntityConfig[] = [
  ...CRM_ENTITIES,
  ...SELLING_ENTITIES,
  ...BUYING_ENTITIES,
  ...STOCK_ENTITIES,
  ...ACCOUNTING_ENTITIES,
  ...HR_ENTITIES,
  ...MANUFACTURING_ENTITIES,
  ...PROJECTS_ENTITIES,
  ...ASSETS_ENTITIES,
  ...QUALITY_ENTITIES,
  ...SUPPORT_ENTITIES,
];

/**
 * Every entity gets a canonical `date` field, always — so "the latest
 * X" / "X from last week" works on ANY doctype without the model having
 * to know that entity's specific date column name (transaction_date vs
 * posting_date vs opening_date vs ...). Where a real business date
 * exists it's mapped explicitly in erpnext/entityMaps/*.ts; where one
 * doesn't (pure masters — Account, Warehouse, Designation) the map
 * falls back to Frappe's own always-present `creation` timestamp, which
 * is exactly the right sort key for "most recently added" anyway. This
 * is a single append here (drives the sortBy enum + the schema string
 * the model sees) plus the matching fallback in entityMap.ts — no
 * per-entity edit needed as module coverage grows to 60+ modules.
 */
for (const config of ENTITY_CONFIGS) {
  if (!config.canonicalFields.includes("date")) config.canonicalFields.push("date");
}

/**
 * Natural-language / SQL-habit names the model reaches for that aren't
 * real entityKeys. Confirmed live (interaction_log, "every customer's
 * overdue + paid/unpaid invoice counts"): the model repeatedly calls
 * data_table.search_schema("invoice") / execute_query({entityKey:"invoice"})
 * / tools.search("invoice") — "invoice" unqualified — then, when every
 * one fails "Unknown entity", abandons the real query and punts the whole
 * request to a PDF report. Same class as the rfq -> request_for_quotation
 * alias already in erpnext/entityMaps/buying.ts, just at the canonical
 * layer so it covers the schema tool and execute_query too. Kept to
 * names that are unambiguous IN PRACTICE for this app's own data
 * questions — "invoice"/"bill" -> the sales/purchase side people
 * actually mean, the two-letter doc shorthands, obvious plurals.
 */
export const ENTITY_ALIASES: Record<string, string> = {
  invoice: "sales_invoice",
  invoices: "sales_invoice",
  sales_invoices: "sales_invoice",
  customer_invoice: "sales_invoice",
  bill: "purchase_invoice",
  bills: "purchase_invoice",
  supplier_invoice: "purchase_invoice",
  purchase_invoices: "purchase_invoice",
  so: "sales_order",
  sales_orders: "sales_order",
  po: "purchase_order",
  purchase_orders: "purchase_order",
  quote: "quotation",
  quotes: "quotation",
  quotations: "quotation",
  customers: "customer",
  suppliers: "supplier",
  vendors: "supplier",
  vendor: "supplier",
  items: "item",
  products: "item",
  product: "item",
  employees: "employee",
  leads: "lead",
  opportunities: "opportunity",
  deals: "opportunity",
  tickets: "issue",
  ticket: "issue",
  payments: "payment_entry",
  payment: "payment_entry",
};

// The RESOLUTION logic (resolveEntityKey / isValidEntity / field-name
// normalization) lives in core/entityUtils.ts — this file stays pure
// DATA (the entity list + the alias table). See EntityUtils there.
