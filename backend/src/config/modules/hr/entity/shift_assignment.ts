import { EntityConfig } from "../../../../core/types";

export const SHIFT_ASSIGNMENT_ENTITY: EntityConfig = {
    entityKey: "shift_assignment",
    module: "hr",
    toolPrefix: "shift_assignment",
    canonicalFields: ["id", "employee", "shift_type", "status", "start_date", "end_date"],
    fieldValues: { status: ["Active", "Inactive"] },
    linkFields: { employee: "employee", shift_type: "shift_type" },
    createFields: ["employee", "shift_type", "start_date"],
    description: "Assigns an employee to a shift type starting from a date",
  };
