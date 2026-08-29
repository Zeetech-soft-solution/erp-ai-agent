/**
 * Canonical reportKey -> ERPNext's actual report name + filter field
 * mapping. ERPNext runs standard reports via a single generic endpoint
 * (frappe.desk.query_report.run) regardless of report type — this file
 * is what makes that ERPNext-specific mechanism invisible to core.
 *
 * NOTE: ERPNext's report output shape (columns as strings vs objects,
 * result as arrays vs dicts) varies by report type and ERPNext version.
 * erpnextConnector.ts normalizes best-effort — verify against your
 * actual ERPNext instance and adjust normalizeReportResult() there if
 * a specific report's shape doesn't match.
 */
export interface ErpNextReportMapping {
  reportName: string;
  filterFieldMap: Record<string, string>; // canonicalFilter -> ERPNext filter key
  // Native ERPNext filter keys/values applied BEFORE the canonical ones
  // above (which can still override) — for filters that are either
  // always the same for this single-company deployment (company) or
  // are ERPNext-specific report-mode toggles with no canonical
  // equivalent (filter_based_on) that would only confuse the LLM if
  // exposed directly. Verified against each report's real .js filter
  // definitions, not assumed — see this file's git history for the
  // exact fieldnames pulled from each report's source.
  defaultFilters?: Record<string, any>;
}

const COMPANY = "Sunrise Electronics Manufacturing Pvt Ltd";

export const ERPNEXT_REPORT_MAP: Record<string, ErpNextReportMapping> = {
  stock_balance: {
    reportName: "Stock Balance",
    filterFieldMap: { item: "item_code", item_group: "item_group", warehouse: "warehouse", as_of_date: "to_date" },
    defaultFilters: { company: COMPANY },
  },
  general_ledger: {
    reportName: "General Ledger",
    filterFieldMap: { account: "account", from_date: "from_date", to_date: "to_date" },
    defaultFilters: { company: COMPANY },
  },
  accounts_receivable: {
    reportName: "Accounts Receivable",
    filterFieldMap: { customer: "customer", as_of_date: "report_date" },
    defaultFilters: { company: COMPANY },
  },
  // Was returning mixed Receivable+Payable rows on this instance — root
  // cause traced to master data, not report code: the "Party Type"
  // doctype (which ERPNext's ReceivablePayableReport uses to look up
  // which party types belong to "Receivable" vs "Payable" via
  // get_party_types_from_account_type) had zero rows, so the report's
  // per-party-type filtering loop never ran for either report and both
  // silently returned every Sales + Purchase Invoice row unfiltered.
  // Fixed 2026-08-04 by seeding the two standard records ERPNext
  // normally ships (Customer->Receivable, Supplier->Payable) directly
  // through frappe's own doc API — a data fix, no ERPNext/Frappe source
  // touched. Worth checking there aren't other master/fixture tables
  // the demo data setup skips.
  accounts_payable: {
    reportName: "Accounts Payable",
    filterFieldMap: { supplier: "party", as_of_date: "report_date" },
    defaultFilters: { company: COMPANY, party_type: "Supplier" },
  },
  balance_sheet: {
    reportName: "Balance Sheet",
    filterFieldMap: { from_date: "period_start_date", to_date: "period_end_date", cost_center: "cost_center" },
    defaultFilters: { company: COMPANY, filter_based_on: "Date Range", periodicity: "Yearly" },
  },
  profit_and_loss: {
    reportName: "Profit and Loss Statement",
    filterFieldMap: { from_date: "period_start_date", to_date: "period_end_date", cost_center: "cost_center" },
    defaultFilters: { company: COMPANY, filter_based_on: "Date Range", periodicity: "Yearly" },
  },
  cash_flow: {
    reportName: "Cash Flow",
    filterFieldMap: { from_date: "period_start_date", to_date: "period_end_date" },
    defaultFilters: { company: COMPANY, filter_based_on: "Date Range", periodicity: "Yearly" },
  },
  trial_balance: {
    reportName: "Trial Balance",
    // fiscal_year is NOT optional here despite from_date/to_date also
    // being accepted — confirmed live: omitting it 417s with "Fiscal
    // Year None is required" even with a valid date range set. Pass a
    // real Fiscal Year name (e.g. "2026-2027") — look one up via
    // fiscal_year.list first if you don't already know the right one.
    filterFieldMap: { from_date: "from_date", to_date: "to_date", cost_center: "cost_center", fiscal_year: "fiscal_year" },
    defaultFilters: { company: COMPANY },
  },
  purchase_register: {
    reportName: "Purchase Register",
    filterFieldMap: { from_date: "from_date", to_date: "to_date", supplier: "supplier" },
    defaultFilters: { company: COMPANY },
  },
  sales_register: {
    reportName: "Sales Register",
    filterFieldMap: { from_date: "from_date", to_date: "to_date", customer: "customer" },
    defaultFilters: { company: COMPANY },
  },

  // Append here as you cover more reports — one entry, canonical
  // filter names on the left, ERPNext's actual filter keys on the right.
};
