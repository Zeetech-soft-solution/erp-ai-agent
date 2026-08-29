import { EntityConfig } from "../../../../core/types";

export const BANK_TRANSACTION_ENTITY: EntityConfig = {
    entityKey: "bank_transaction",
    module: "accounting",
    toolPrefix: "bank_transaction",
    canonicalFields: ["id", "date", "status", "bank_account", "deposit", "withdrawal", "unallocated_amount", "party"],
    fieldValues: { status: ["Pending", "Settled", "Unreconciled", "Reconciled", "Cancelled"] },
    linkFields: { bank_account: "bank_account" },
    operations: ["list", "get"],
    description: "Raw bank statement lines, pending or already matched against payments for reconciliation",
  };
