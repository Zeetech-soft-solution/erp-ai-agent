import { EntityConfig } from "../../../../core/types";

export const ACCOUNT_ENTITY: EntityConfig = {
    entityKey: "account",
    module: "accounting",
    toolPrefix: "account",
    // 2026-08-23: description cut to a one-liner, but the two real facts
    // behind a confirmed 2026-08-11 live bug are kept — "type" is a
    // ~20-value technical sub-classification (Bank/Cash/Receivable/...),
    // NOT the broad Asset/Liability/Equity/Income/Expense category; a
    // naive {"type":"Income"} filter silently matched nothing. root_type
    // is the real field for that. Full original prose in git history.
    canonicalFields: ["id", "display_name", "type", "root_type", "is_group", "disabled"],
    // Reordered 2026-08-25 to match the real Account.root_type
    // DocField.options order exactly (was Equity before Income/Expense).
    fieldValues: { root_type: ["Asset", "Liability", "Income", "Expense", "Equity"] },
    operations: ["list", "get"],
    description: "Chart of accounts. filter on root_type (Asset|Liability|Equity|Income|Expense). No balance field. Use sales_invoice/purchase_invoice for totals.",
  };
