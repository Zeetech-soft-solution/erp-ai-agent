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
  ...NOTIFICATIONS_MAP,
};

/** Reverse of ERPNEXT_ENTITY_MAP's entityKey -> doctype, e.g. "Lead" ->
 *  "lead". Lets ERPNext-facing entry points (like an inbound webhook,
 *  which only knows the doctype it fired for) resolve back to a
 *  canonical entityKey without ever hardcoding a doctype name. */
const DOCTYPE_TO_ENTITY_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(ERPNEXT_ENTITY_MAP).map(([entityKey, mapping]) => [mapping.doctype, entityKey])
);

export function entityKeyForDoctype(doctype: string): string | undefined {
  return DOCTYPE_TO_ENTITY_KEY[doctype];
}

export function nativeFields(entityKey: string): string[] {
  const mapping = ERPNEXT_ENTITY_MAP[entityKey];
  if (!mapping) throw new Error(`No ERPNext entity mapping for "${entityKey}"`);
  return Object.values(mapping.fieldMap);
}

export function toNativeData(entityKey: string, canonicalData: Record<string, any>): Record<string, any> {
  const mapping = ERPNEXT_ENTITY_MAP[entityKey];
  if (!mapping) throw new Error(`No ERPNext entity mapping for "${entityKey}"`);
  const out: Record<string, any> = {};
  for (const [canonical, value] of Object.entries(canonicalData)) {
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
    out[canonical] = nativeRow[native];
  }
  return out;
}
