import { EntityConfig } from "../../../../core/types";

export const SALARY_SLIP_ENTITY: EntityConfig = {
    entityKey: "salary_slip",
    module: "hr",
    toolPrefix: "salary_slip",
    canonicalFields: ["id", "employee", "department", "status", "net_pay", "total_earnings", "total_deduction", "start_date", "end_date"],
    fieldValues: { status: ["Draft", "Submitted", "Cancelled", "Withheld"] },
    linkFields: { employee: "employee" },
    operations: ["list", "get"],
    description: "Payroll — an employee's salary slip for a pay period",
  };
