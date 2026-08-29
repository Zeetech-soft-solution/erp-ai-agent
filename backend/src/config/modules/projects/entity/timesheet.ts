import { EntityConfig } from "../../../../core/types";

export const TIMESHEET_ENTITY: EntityConfig = {
    entityKey: "timesheet",
    module: "projects",
    toolPrefix: "timesheet",
    canonicalFields: ["id", "employee", "customer", "status", "start_date", "end_date", "total_hours", "per_billed"],
    fieldValues: { status: ["Draft", "Submitted", "Partially Billed", "Billed", "Payslip", "Completed", "Cancelled"] },
    linkFields: { employee: "employee", customer: "customer" },
    operations: ["list", "get"],
    description: "Logged time against a project/task",
  };
