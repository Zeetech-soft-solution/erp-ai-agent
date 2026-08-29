import { EntityConfig } from "../../../../core/types";

export const PRODUCTION_PLAN_ENTITY: EntityConfig = {
    entityKey: "production_plan",
    module: "manufacturing",
    toolPrefix: "production_plan",
    canonicalFields: ["id", "status", "date", "from_date", "to_date", "total_planned_qty", "total_produced_qty"],
    fieldValues: { status: ["Draft", "Submitted", "Not Started", "In Process", "Completed", "Closed", "Cancelled", "Material Requested"] },
    operations: ["list", "get"],
    description: "Aggregated production planning across multiple sales/work orders",
  };
