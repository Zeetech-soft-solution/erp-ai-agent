import { EntityConfig } from "../../../../core/types";

export const STOCK_RECONCILIATION_ENTITY: EntityConfig = {
    entityKey: "stock_reconciliation",
    module: "stock",
    toolPrefix: "stock_reconciliation",
    // No "status" field on this doctype (confirmed against live schema) —
    // it's a simple submittable voucher, not a workflow document.
    canonicalFields: ["id", "purpose", "date", "difference_amount"],
    operations: ["list", "get"],
    description: "Physical stock count adjustment against system-recorded quantities",
  };
