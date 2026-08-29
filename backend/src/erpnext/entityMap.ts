import { ENTITY_ALIASES } from "../config/entities.config";
import { ErpNextEntityMapping } from "./entityMaps/types";
import { CRM_MAP } from "./entityMaps/crm";
import { SELLING_MAP } from "./entityMaps/selling";
import { BUYING_MAP } from "./entityMaps/buying";
import { STOCK_MAP } from "./entityMaps/stock";
import { ACCOUNTING_MAP } from "./entityMaps/accounting";
import { HR_MAP } from "./entityMaps/hr";
import { MANUFACTURING_MAP } from "./entityMaps/manufacturing";
import { PROJECTS_MAP } from "./entityMaps/projects";
import { ASSETS_MAP } from "./entityMaps/assets";
import { QUALITY_MAP } from "./entityMaps/quality";
import { SUPPORT_MAP } from "./entityMaps/support";
import { NOTIFICATIONS_MAP } from "./entityMaps/notifications";

export type { ErpNextEntityMapping };

/**
 * THE translation table for ERPNext, ASSEMBLED from one file per
 * standard ERP module (erpnext/entityMaps/*.ts), mirroring
 * config/modules/*.entities.ts one-to-one. Every canonical entityKey
 * used anywhere in core/modules maps here to: which ERPNext doctype it
 * is, and how canonical field names correspond to ERPNext's native
 * field names. If ERPNext renames a field or you repoint an entity at
 * a different doctype, edit ONE small per-module file — no tool, no
 * renderer, no role policy entry is affected, because they all only
 * ever see canonical field names.
 *
 * To add a new module: create erpnext/entityMaps/<name>.ts matching
 * config/modules/<name>.entities.ts's entityKeys, import + spread it
 * below. Nothing else changes.
 */
export const ERPNEXT_ENTITY_MAP: Record<string, ErpNextEntityMapping> = {
  ...CRM_MAP,
  ...SELLING_MAP,
  ...BUYING_MAP,
  ...STOCK_MAP,
  ...ACCOUNTING_MAP,
  ...HR_MAP,
  ...MANUFACTURING_MAP,
  ...PROJECTS_MAP,
  ...ASSETS_MAP,
  ...QUALITY_MAP,
  ...SUPPORT_MAP,
  ...NOTIFICATIONS_MAP,
};

/**
 * Canonical `date` on EVERY entity (mirror of entities.config.ts's own
 * canonicalFields append). A per-module map that names a real business
 * date column for its entity (transaction_date, posting_date,
 * opening_date, planned_start_date, ...) always wins; anything left
 * without one falls back to Frappe's universal `creation` timestamp —
 * always present on every doctype, and the correct "most recently
 * added" ordering for the masters (Account, Warehouse, Designation)
 * that have no business date of their own. Nothing to add per-entity as
 * coverage grows.
 */
for (const mapping of Object.values(ERPNEXT_ENTITY_MAP)) {
  if (!("date" in mapping.fieldMap)) mapping.fieldMap.date = "creation";
}

/** Reverse of ERPNEXT_ENTITY_MAP's entityKey -> doctype, e.g. "Lead" ->
 *  "lead". Lets ERPNext-facing entry points (like an inbound webhook,
 *  which only knows the doctype it fired for) resolve back to a
 *  canonical entityKey without ever hardcoding a doctype name. Built
 *  from the REAL keys only — before the alias loop below — so a doctype
 *  never resolves back to one of its aliases. */
const DOCTYPE_TO_ENTITY_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(ERPNEXT_ENTITY_MAP).map(([entityKey, mapping]) => [mapping.doctype, entityKey])
);

/**
 * Point every natural-language entity alias (config/entities.config.ts's
 * ENTITY_ALIASES — "invoice" -> sales_invoice, "bill" -> purchase_invoice,
 * ...) at the same mapping object as its real target, exactly as
 * buying.ts already does by hand for rfq -> request_for_quotation. So a
 * connector call that slipped through with an alias entityKey still
 * translates instead of throwing "No ERPNext entity mapping".
 */
for (const [alias, target] of Object.entries(ENTITY_ALIASES)) {
  if (ERPNEXT_ENTITY_MAP[target] && !ERPNEXT_ENTITY_MAP[alias]) {
    ERPNEXT_ENTITY_MAP[alias] = ERPNEXT_ENTITY_MAP[target];
  }
}

export function entityKeyForDoctype(doctype: string): string | undefined {
  return DOCTYPE_TO_ENTITY_KEY[doctype];
}

export function nativeFields(entityKey: string): string[] {
  const mapping = ERPNEXT_ENTITY_MAP[entityKey];
  if (!mapping) throw new Error(`No ERPNext entity mapping for "${entityKey}"`);
  // Deduped: the canonical `date` alias often points at a native column
  // (posting_date, start_date, ...) another canonical field already
  // maps to — Frappe's get_list doesn't need it asked for twice.
  return [...new Set(Object.values(mapping.fieldMap))];
}

/**
 * Filter-specific counterpart to toNativeData() below — deliberately
 * throws on an unrecognized canonical field instead of silently
 * dropping it. Confirmed live 2026-08-11: "how many new leads this
 * month" filtered on a plausible-but-wrong field name ("created_date"
 * instead of the real "created") — toNativeData()'s silent
 * console.warn-and-drop meant the date condition never reached ERPNext
 * at all, and the query fell back to an unfiltered default-sorted list
 * with no error of any kind; July-dated rows leaked into a "this month"
 * answer. A dropped WHERE-clause condition is far more dangerous than a
 * dropped create/update field (the same silent-drop toNativeData still
 * correctly uses for document bodies, where an occasional extra/unknown
 * field is a much lower-stakes, more plausible legitimate case) — a
 * filter is the one thing standing between "the right rows" and "an
 * unrelated but plausible-looking set of rows", so getting it silently
 * ignored is worse than an explicit failure the LLM can see and correct.
 * Used by erpnextConnector.ts's list()/aggregate() for exactly this
 * reason; runReport()'s separate filterFieldMap is a different,
 * smaller, curated structure not covered by this helper.
 */
export function toNativeFilters(entityKey: string, canonicalFilters: Record<string, any>): Record<string, any> {
  const mapping = ERPNEXT_ENTITY_MAP[entityKey];
  if (!mapping) throw new Error(`No ERPNext entity mapping for "${entityKey}"`);
  const out: Record<string, any> = {};
  for (const [canonical, value] of Object.entries(canonicalFilters)) {
    const native = mapping.fieldMap[canonical];
    if (!native) {
      // Confirmed live 2026-08-12: this error correctly stops a wrong
      // guess ("item_group" on item, "date_of_birth" filtered but not a
      // real employee field — "date" is no longer one of these, every
      // entity now carries a canonical `date`, see the fieldMap fallback
      // in this file) from
      // silently producing wrong data — but production logs show the
      // model then just repeats the exact same wrong guess on retry
      // rather than recovering, because "check this tool's own filter
      // description" sends it back to re-read a whole schema instead of
      // handing it the answer directly. Listing the real options right
      // here (the same information, just not making the model go fetch
      // it) gives a retry an actual chance of succeeding on the next
      // call instead of failing the same way again.
      throw new Error(
        `"${canonical}" is not a real filter field for "${entityKey}" — the real canonical filter fields for this ` +
          `entity are: ${Object.keys(mapping.fieldMap).join(", ")}. Use one of those (an unrecognized field name ` +
          `would otherwise be silently ignored, producing an unfiltered or wrong result instead of an error).`
      );
    }
    out[native] = value;
  }
  return out;
}

export function toNativeData(entityKey: string, canonicalData: Record<string, any>): Record<string, any> {
  const mapping = ERPNEXT_ENTITY_MAP[entityKey];
  if (!mapping) throw new Error(`No ERPNext entity mapping for "${entityKey}"`);
  const out: Record<string, any> = {};
  for (const [canonical, value] of Object.entries(canonicalData)) {
    const childTable = mapping.childTables?.[canonical];
    if (childTable && Array.isArray(value)) {
      out[childTable.nativeField] = value.map((row) => {
        const nativeRow: Record<string, any> = {};
        for (const [rowCanonical, rowValue] of Object.entries(row || {})) {
          const rowNative = childTable.fieldMap[rowCanonical];
          if (rowNative) {
            nativeRow[rowNative] = rowValue;
          } else {
            console.warn(`[entityMap] "${rowCanonical}" has no native mapping for "${entityKey}.${canonical}" rows — ignored`);
          }
        }
        return nativeRow;
      });
      continue;
    }
    const native = mapping.fieldMap[canonical];
    if (native) {
      out[native] = value;
    } else {
      console.warn(`[entityMap] "${canonical}" has no native mapping for "${entityKey}" — ignored`);
    }
  }
  return out;
}

export function toCanonicalRow(entityKey: string, nativeRow: Record<string, any>): Record<string, any> {
  const mapping = ERPNEXT_ENTITY_MAP[entityKey];
  if (!mapping) throw new Error(`No ERPNext entity mapping for "${entityKey}"`);
  const out: Record<string, any> = {};
  for (const [canonical, native] of Object.entries(mapping.fieldMap)) {
    // Real bug found live 2026-08-21, the very first real test of a
    // dotted CHILD-TABLE native field (e.g. "items.supplier_quotation" —
    // see entityMaps/buying.ts's own doc comment): Frappe's own real
    // result rows come back keyed by the BARE column name ("supplier_quotation"),
    // never the full dotted path, even though the dotted string IS what
    // you pass into `fields`/`filters`. Looking a dotted native value up
    // by its own literal string against the raw row always missed,
    // silently leaving the canonical field undefined on every row.
    // Confirmed via a real end-to-end round trip against production
    // data before this fix (payload had no source_supplier_quotation at
    // all), then again after. Plain (non-dotted) fields are completely
    // unaffected — the "." lookup only ever changes behavior when one
    // is actually present.
    const rawKey = native.includes(".") ? native.slice(native.lastIndexOf(".") + 1) : native;
    out[canonical] = nativeRow[rawKey];
  }
  // Reverse of toNativeData's childTables handling above — confirmed
  // live 2026-08-09 that ERPNext's single-record GET (getDoc) already
  // returns full child-table rows regardless of what fields were asked
  // for (Frappe's by-name resource fetch always returns the whole
  // document), so this data was sitting right there unused the whole
  // time; the gap was purely that nothing on our side ever read it back
  // into canonical shape. Confirmed live consequence of that gap:
  // asked to convert a quotation to a sales order, the model had no way
  // to see the quotation's real items and asked the user to retype them
  // by hand — item codes, quantities, rates it already had, just never
  // exposed. NOT populated on .list() results (Frappe's list endpoint
  // doesn't return child-table data at all, by design on ERPNext's
  // side, not something this connector controls) — only .get() ever
  // has real rows here; each canonical row's line-items field is simply
  // absent from a list result, not wrong.
  if (mapping.childTables) {
    for (const [canonical, childTable] of Object.entries(mapping.childTables)) {
      const nativeRows = nativeRow[childTable.nativeField];
      if (!Array.isArray(nativeRows)) continue;
      const reverseFieldMap = Object.fromEntries(Object.entries(childTable.fieldMap).map(([c, n]) => [n, c]));
      out[canonical] = nativeRows.map((row: Record<string, any>) => {
        const canonicalRow: Record<string, any> = {};
        for (const [native, value] of Object.entries(row)) {
          const rowCanonical = reverseFieldMap[native];
          if (rowCanonical) canonicalRow[rowCanonical] = value;
        }
        return canonicalRow;
      });
    }
  }
  return out;
}
