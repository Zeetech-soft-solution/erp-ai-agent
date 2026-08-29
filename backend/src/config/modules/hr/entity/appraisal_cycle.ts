import { EntityConfig } from "../../../../core/types";

export const APPRAISAL_CYCLE_ENTITY: EntityConfig = {
    entityKey: "appraisal_cycle",
    module: "hr",
    toolPrefix: "appraisal_cycle",
    canonicalFields: ["id", "status", "start_date", "end_date"],
    fieldValues: { status: ["Not Started", "In Progress", "Completed"] },
    operations: ["list", "get"],
    description: "A recurring performance-review cycle (e.g. quarterly)",
  };
