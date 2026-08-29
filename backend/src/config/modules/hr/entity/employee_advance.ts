import { EntityConfig } from "../../../../core/types";

export const EMPLOYEE_ADVANCE_ENTITY: EntityConfig = {
    entityKey: "employee_advance",
    module: "hr",
    toolPrefix: "employee_advance",
    canonicalFields: ["id", "employee", "date", "advance_amount", "purpose", "status", "paid_amount", "pending_amount"],
    fieldValues: { status: ["Draft", "Paid", "Partially Paid", "Unpaid", "Claimed", "Returned", "Partly Claimed and Returned", "Cancelled"] },
    linkFields: { employee: "employee" },
    createFields: ["employee", "advance_amount", "purpose"],
    description: "Advance payment requested by/for an employee, repaid or adjusted against salary",
  };
