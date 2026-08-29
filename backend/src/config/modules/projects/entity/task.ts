import { EntityConfig } from "../../../../core/types";

export const TASK_ENTITY: EntityConfig = {
    entityKey: "task",
    module: "projects",
    toolPrefix: "task",
    canonicalFields: ["id", "project", "subject", "status", "priority", "assigned_to", "date"],
    fieldValues: { status: ["Open", "Working", "Pending Review", "Overdue", "Template", "Completed", "Cancelled"] },
    linkFields: { project: "project" },
    createFields: ["project", "subject", "priority"],
    description: "Project tasks",
  };
