import { EntityConfig } from "../../../../core/types";

export const JOB_CARD_ENTITY: EntityConfig = {
    entityKey: "job_card",
    module: "manufacturing",
    toolPrefix: "job_card",
    canonicalFields: ["id", "work_order", "operation", "status", "expected_start_date", "expected_end_date", "actual_start_date"],
    fieldValues: { status: ["Open", "Work In Progress", "Partially Transferred", "Material Transferred", "On Hold", "Submitted", "Cancelled", "Completed"] },
    linkFields: { work_order: "work_order", operation: "operation" },
    operations: ["list", "get"],
    description: "Shop-floor tracking of a single work order operation",
  };
