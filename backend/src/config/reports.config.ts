import { ReportConfig } from "../core/types";

/**
 * Canonical report list — same discipline as entities.config.ts: no
 * system-specific report names here. Each connector's report map
 * (erpnext/reportMap.ts, later sap/reportMap.ts) resolves reportKey to
 * whatever that system actually calls it internally.
 */
export const REPORT_CONFIGS: ReportConfig[] = [
  {
    reportKey: "stock_balance",
    module: "stock",
    // item_group added 2026-08-11 - confirmed live: "what is our raw
    // materials stock" filtered {"item":"raw_material"} (a guessed
    // snake_case category name passed as an item CODE, the only filter
    // that existed) and silently matched nothing. This report never had
    // an item_group filter at all despite ERPNext's real Stock Balance
    // report supporting one natively - a genuine missing capability, not
    // just an undocumented one. "item" here means a specific item CODE
    // (e.g. "RM-1001"), never a category name like "raw materials" -
    // resolve the real item_group via item.list first if unsure (real
    // values are company-suffixed too, e.g. "Raw Materials - Electronic",
    // not a guessable snake_case string).
    description: "Current stock quantity/value per item and warehouse. \"item\" filters by a specific item " +
      "code, never a category name - for a category like \"raw materials\", use \"item_group\" instead, and " +
      "resolve its real value via item.list first rather than guessing (real values are often suffixed, e.g. " +
      "\"Raw Materials - Electronic\").",
    filterFields: ["item", "item_group", "warehouse", "as_of_date"],
  },
  {
    reportKey: "general_ledger",
    module: "accounting",
    description: "Detailed account-wise transaction ledger",
    filterFields: ["account", "from_date", "to_date"],
  },
  {
    reportKey: "accounts_receivable",
    module: "accounting",
    description: "Outstanding customer invoice aging",
    filterFields: ["customer", "as_of_date"],
  },
  {
    reportKey: "accounts_payable",
    module: "accounting",
    description: "Outstanding supplier bill aging",
    filterFields: ["supplier", "as_of_date"],
  },
  {
    reportKey: "balance_sheet",
    module: "accounting",
    description: "Assets, liabilities, and equity as of a period — the core financial statement",
    filterFields: ["from_date", "to_date", "cost_center"],
  },
  {
    reportKey: "profit_and_loss",
    module: "accounting",
    description: "Income and expenses over a period, netting to profit or loss",
    filterFields: ["from_date", "to_date", "cost_center"],
  },
  {
    reportKey: "cash_flow",
    module: "accounting",
    description: "Cash movement over a period, grouped into operating/investing/financing activity",
    filterFields: ["from_date", "to_date"],
  },
  {
    reportKey: "trial_balance",
    module: "accounting",
    description: "Opening, debit/credit movement, and closing balance for every account over a period. fiscal_year is required (e.g. \"2026-2027\") — look one up via the fiscal_year entity first if unknown",
    filterFields: ["from_date", "to_date", "cost_center", "fiscal_year"],
  },
  {
    reportKey: "purchase_register",
    module: "accounting",
    description: "Purchase invoice transaction listing over a period, optionally by supplier",
    filterFields: ["from_date", "to_date", "supplier"],
  },
  {
    reportKey: "sales_register",
    module: "accounting",
    description: "Sales invoice transaction listing over a period, optionally by customer",
    filterFields: ["from_date", "to_date", "customer"],
  },

  // Append more here — canonical reportKey + module + filter names
  // only. Then add the matching entry to erpnext/reportMap.ts (and,
  // later, sap/reportMap.ts) so a provider knows how to actually run it.
];
