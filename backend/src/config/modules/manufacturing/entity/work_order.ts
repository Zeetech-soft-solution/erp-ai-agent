import { EntityConfig } from "../../../../core/types";

export const WORK_ORDER_ENTITY: EntityConfig = {
    entityKey: "work_order",
    module: "manufacturing",
    toolPrefix: "work_order",
    canonicalFields: ["id", "item", "bom", "quantity", "status", "planned_start_date", "actual_start_date", "total_operating_cost"],
    fieldValues: { status: ["Draft", "Submitted", "Not Started", "In Process", "Stock Reserved", "Stock Partially Reserved", "Completed", "Stopped", "Closed", "Cancelled"] },
    linkFields: { item: "item", bom: "bom" },
    createFields: ["item", "bom", "quantity"],
    description: "Manufacturing work orders",
  };
