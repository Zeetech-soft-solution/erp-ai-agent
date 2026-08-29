import { EntityConfig } from "../../../../core/types";

export const LANDED_COST_VOUCHER_ENTITY: EntityConfig = {
    entityKey: "landed_cost_voucher",
    module: "buying",
    toolPrefix: "landed_cost_voucher",
    // No "status" field exists on this doctype (confirmed against live
    // schema) — it's a simple submittable voucher, not a workflow document.
    canonicalFields: ["id", "date", "total_taxes_and_charges"],
    operations: ["list", "get"],
    description: "Additional landed costs (freight, customs, insurance) apportioned onto received purchase receipts",
  };
