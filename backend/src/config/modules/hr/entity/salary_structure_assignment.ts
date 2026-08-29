import { EntityConfig } from "../../../../core/types";

export const SALARY_STRUCTURE_ASSIGNMENT_ENTITY: EntityConfig = {
    entityKey: "salary_structure_assignment",
    module: "hr",
    toolPrefix: "salary_structure_assignment",
    canonicalFields: ["id", "employee", "salary_structure", "from_date", "base", "ctc"],
    linkFields: { employee: "employee" },
    // ctc/base are computed from the linked Salary Structure's components,
    // and Payroll Entry.validate() is strict about exactly one active
    // assignment per employee at a time — read-only, same caution as
    // payroll_entry below.
    operations: ["list", "get"],
    description: "Links an employee to a salary structure effective from a date",
  };
