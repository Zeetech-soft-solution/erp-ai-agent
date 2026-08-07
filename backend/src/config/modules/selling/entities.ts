import { EntityConfig } from "../../../core/types";

/** Selling module. Free tier: only quotation, and only "list" — no
 *  get/create/update, and no sales_order/sales_invoice/pos_invoice/
 *  pricing_rule/everything else beyond it. This is intentionally the
 *  single API surface free exposes; the rest is pro-tier. */
export const SELLING_ENTITIES: EntityConfig[] = [
  {
    entityKey: "quotation",
    module: "selling",
    toolPrefix: "quotation",
    canonicalFields: ["id", "party", "status", "total", "date"],
    createFields: ["party"],
    operations: ["list"],
    description: "Sales quotations",
  },
];
