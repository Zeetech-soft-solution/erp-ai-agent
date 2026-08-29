import { EntityConfig } from "../../../../core/types";

export const QUOTATION_ENTITY: EntityConfig = {
    entityKey: "quotation",
    module: "selling",
    toolPrefix: "quotation",
    // "items" added 2026-08-09 — quotation.get() now returns the real
    // line items (erpnext/entityMap.ts's toCanonicalRow gained reverse
    // childTables mapping the same day). ONLY on .get(), never .list():
    // ERPNext's list endpoint doesn't return child-table data at all,
    // regardless of how many rows match — a Frappe platform limitation,
    // not something row-count-dependent or fixable on this side. Before
    // this, converting a quotation to a sales order meant asking the
    // user to retype item codes/qty/rate by hand, data the quotation
    // already had.
    canonicalFields: ["id", "party", "status", "total", "date", "valid_till", "items"],
    fieldValues: { status: ["Draft", "Open", "Replied", "Partially Ordered", "Ordered", "Lost", "Cancelled", "Expired"] },
    createFields: ["party"],
    lineItems: { canonicalField: "items", itemFields: ["item_code", "qty", "uom", "rate", "warehouse"] },
    description: "Sales quotation sent to customer. Use .get for items. Convert to Sales Order.",
  };
