import { EntityConfig } from "../../../core/types";

/** Selling module. Free tier: only quotation (list/get/create) — no
 *  update, and no sales_order/sales_invoice/pos_invoice/pricing_rule/
 *  everything else beyond it. That extended coverage is pro-tier. */
export const SELLING_ENTITIES: EntityConfig[] = [
  {
    entityKey: "quotation",
    module: "selling",
    toolPrefix: "quotation",
    canonicalFields: ["id", "party", "status", "total", "date"],
    createFields: ["party"],
    operations: ["list", "get", "create"],
    description: "Sales quotations",
  },
];
