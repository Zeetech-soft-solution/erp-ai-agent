import { EntityConfig } from "../../../../core/types";

export const SALARY_STRUCTURE_ENTITY: EntityConfig = {
    entityKey: "salary_structure",
    module: "hr",
    toolPrefix: "salary_structure",
    // Template document with earnings/deductions child tables — read-only,
    // same reasoning as the multi-line financial documents in accounting.
    canonicalFields: ["id", "is_active", "net_pay"],
    operations: ["list", "get"],
    description: "Salary structure template (earnings/deductions components) assignable to employees",
  };
