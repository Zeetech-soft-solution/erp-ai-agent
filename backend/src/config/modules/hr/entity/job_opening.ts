import { EntityConfig } from "../../../../core/types";

export const JOB_OPENING_ENTITY: EntityConfig = {
    entityKey: "job_opening",
    module: "hr",
    toolPrefix: "job_opening",
    canonicalFields: ["id", "display_name", "department", "designation", "status", "date"],
    fieldValues: { status: ["Open", "Closed"] },
    createFields: ["display_name", "department", "designation"],
    description: "Recruitment — open positions",
  };
