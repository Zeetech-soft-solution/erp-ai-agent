import { EntityConfig } from "../../../../core/types";

export const EXPENSE_CLAIM_ENTITY: EntityConfig = {
    // New 2026-08-09: found in the same erpdatabuild-usage audit that
    // added training_event/issue - Expense Claim is real and actively
    // simulated (build/2_build_history.py's simulate_expense_claims_day,
    // submitted with a real approval flow), but had been missed
    // entirely despite employee_advance (a similar HR-financial-request
    // entity) already existing. ERPNext's own DocPerm grants create to
    // Employee (self-request), HR User, HR Manager, and Expense Approver
    // (confirmed against the live instance) - the same shape as
    // employee_advance below, and Employee's own ROLE_TOOL_MAP block in
    // roles.policy.ts already has that self-request pattern for exactly
    // this reason.
    entityKey: "expense_claim",
    module: "hr",
    toolPrefix: "expense_claim",
    canonicalFields: ["id", "employee", "posting_date", "approval_status", "status", "total_claimed_amount", "total_sanctioned_amount", "expense_approver"],
    fieldValues: {
      status: ["Draft", "Paid", "Unpaid", "Rejected", "Submitted", "Cancelled"],
      approval_status: ["Draft", "Approved", "Rejected", "Cancelled"],
    },
    linkFields: { employee: "employee" },
    createFields: ["employee", "posting_date"],
    lineItems: {
      canonicalField: "expenses",
      itemFields: ["expense_type", "amount", "cost_center"],
      description: "At least one expense line required. Each item: expense_type, amount, cost_center (cost_center has no doctype default here - look one up via cost_center.list if unknown).",
    },
    description: "An employee's claim for reimbursable expenses",
  };
