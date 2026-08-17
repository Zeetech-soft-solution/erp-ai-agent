/** Shared shape for every per-module ERPNext entity map file. */
export interface ErpNextEntityMapping {
  doctype: string;
  fieldMap: Record<string, string>; // canonicalField -> erpnextField
  // Mirrors core/types.ts EntityConfig.lineItems — keyed by the SAME
  // canonical field name (e.g. "items") the entity config uses, so
  // entityModuleFactory's generated schema and this mapping always
  // agree on what the LLM is allowed to send. nativeField is the
  // ERPNext child-table fieldname (e.g. "items" on Sales Order);
  // fieldMap here is per-row (item_code -> item_code, etc.), separate
  // from the header's own fieldMap above.
  childTables?: Record<string, { nativeField: string; fieldMap: Record<string, string> }>;
}
export type ErpNextEntityMapModule = Record<string, ErpNextEntityMapping>;
