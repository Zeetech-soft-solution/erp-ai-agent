import { ErpNextEntityMapModule } from "./types";

export const ACCOUNTING_MAP: ErpNextEntityMapModule = {
  journal_entry: {
    doctype: "Journal Entry",
    fieldMap: { id: "name", date: "posting_date", total_debit: "total_debit", total_credit: "total_credit", status: "docstatus" },
  },
  payment_entry: {
    doctype: "Payment Entry",
    fieldMap: { id: "name", party: "party", amount: "paid_amount", date: "posting_date", status: "status" },
  },
  account: {
    doctype: "Account",
    fieldMap: { id: "name", display_name: "account_name", type: "account_type", root_type: "root_type", is_group: "is_group", disabled: "disabled" },
  },
  cost_center: {
    doctype: "Cost Center",
    fieldMap: { id: "name", display_name: "cost_center_name", is_group: "is_group", disabled: "disabled" },
  },
  gl_entry: {
    doctype: "GL Entry",
    fieldMap: {
      id: "name", date: "posting_date", account: "account", party: "party", voucher_type: "voucher_type",
      voucher_no: "voucher_no", debit: "debit", credit: "credit", cost_center: "cost_center", against: "against",
    },
  },
  fiscal_year: {
    doctype: "Fiscal Year",
    fieldMap: { id: "name", year_start_date: "year_start_date", year_end_date: "year_end_date", disabled: "disabled", date: "year_start_date" },
  },
  bank_transaction: {
    doctype: "Bank Transaction",
    fieldMap: {
      id: "name", date: "date", status: "status", bank_account: "bank_account", deposit: "deposit",
      withdrawal: "withdrawal", unallocated_amount: "unallocated_amount", party: "party",
    },
  },
  bank_account: {
    doctype: "Bank Account",
    fieldMap: { id: "name", display_name: "account_name", bank: "bank", is_default: "is_default", account: "account" },
  },
};
