import { EntityConfig } from "../../../../core/types";

export const SUBCONTRACTING_ORDER_ENTITY: EntityConfig = {
    entityKey: "subcontracting_order",
    module: "buying",
    toolPrefix: "subcontracting_order",
    canonicalFields: ["id", "supplier", "status", "date", "per_received"],
    fieldValues: { status: ["Draft", "Open", "Partially Received", "Completed", "Material Transferred", "Partial Material Transferred", "Cancelled", "Closed"] },
    linkFields: { supplier: "supplier" },
    // Always generated from an is_subcontracted Purchase Order via
    // ERPNext's make_subcontracting_order, never created standalone —
    // list/get only, same reasoning as purchase_receipt.
    operations: ["list", "get"],
    description: "Job-work order sent to a subcontractor to convert supplied raw materials into a finished/sub-assembly item",
  };
