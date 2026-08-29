import { EntityConfig } from "../../../../core/types";

export const APPRAISAL_ENTITY: EntityConfig = {
    entityKey: "appraisal",
    module: "hr",
    toolPrefix: "appraisal",
    // Generated per employee when an Appraisal Cycle runs — no
    // standalone creation flow, and has no status field of its own.
    canonicalFields: ["id", "employee", "appraisal_cycle", "final_score", "start_date", "end_date"],
    linkFields: { employee: "employee", appraisal_cycle: "appraisal_cycle" },
    operations: ["list", "get"],
    description: "An individual employee's performance appraisal within a cycle, scored against KRAs/goals",
  };
