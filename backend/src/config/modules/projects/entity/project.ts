import { EntityConfig } from "../../../../core/types";

export const PROJECT_ENTITY: EntityConfig = {
    entityKey: "project",
    module: "projects",
    toolPrefix: "project",
    canonicalFields: ["id", "display_name", "status", "priority", "percent_complete", "expected_start_date", "expected_end_date", "customer"],
    fieldValues: { status: ["Open", "On hold", "Completed", "Cancelled"] },
    linkFields: { customer: "customer" },
    createFields: ["display_name", "priority", "expected_start_date", "expected_end_date"],
    description: "Projects",
  };
