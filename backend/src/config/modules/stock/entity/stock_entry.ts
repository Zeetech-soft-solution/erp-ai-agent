import { EntityConfig } from "../../../../core/types";

export const STOCK_ENTRY_ENTITY: EntityConfig = {
    entityKey: "stock_entry",
    module: "stock",
    toolPrefix: "stock_entry",
    // No "status" field exists on this doctype (confirmed against live
    // schema — only submittable docstatus) — from_warehouse/to_warehouse
    // are the fields that actually describe the movement.
    canonicalFields: ["id", "entry_type", "purpose", "date", "work_order", "from_warehouse", "to_warehouse"],
    linkFields: { work_order: "work_order", from_warehouse: "warehouse", to_warehouse: "warehouse" },
    operations: ["list", "get"],
    description: "Internal stock movements (transfer, receipt, issue, manufacture)",
  };
