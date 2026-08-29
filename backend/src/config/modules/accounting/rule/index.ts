import { RuleSet } from "../../../../core/types";

/**
 * Accounting module rules — deliberately empty, not a stub awaiting
 * coverage. Every accounting entity (journal_entry, payment_entry,
 * account, cost_center, gl_entry, fiscal_year, bank_transaction,
 * bank_account — see entities.ts) is list/get only: these are either
 * pure ledger/master data (gl_entry, fiscal_year, account, cost_center,
 * bank_account) or multi-line financial documents ERPNext's own
 * make_payment_entry-style flows generate from a Sales/Purchase
 * Invoice (journal_entry, payment_entry, bank_transaction) — the same
 * reasoning that keeps sales_invoice/purchase_invoice/delivery_note
 * list/get only in selling/buying/stock. A RuleSet only ever fires on
 * a create/update tool, so there's nothing here to register against.
 */
export const ACCOUNTING_RULES: RuleSet[] = [];
