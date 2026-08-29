import { EntityConfig } from "../../../../core/types";

export const PAYROLL_ENTRY_ENTITY: EntityConfig = {
    entityKey: "payroll_entry",
    module: "hr",
    toolPrefix: "payroll_entry",
    // Multi-step submit process (fills employee list, generates Salary
    // Slips as a side effect) — never a simple flat create, same
    // reasoning as sales_invoice/purchase_invoice.
    canonicalFields: ["id", "status", "start_date", "end_date", "payroll_frequency"],
    fieldValues: { status: ["Draft", "Submitted", "Cancelled", "Queued", "Failed"] },
    operations: ["list", "get"],
    description: "A payroll run for a pay period, generating salary slips for all included employees",
  };
