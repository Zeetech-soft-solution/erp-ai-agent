import { ErpNextEntityMapModule } from "./types";

export const SELLING_MAP: ErpNextEntityMapModule = {
  quotation: {
    doctype: "Quotation",
    // owner/modified are standard Frappe framework fields on every
    // doctype - added so the notification poll (see
    // core/erpnextNotificationSync.ts) can filter "mine, changed since
    // I last checked" the same way it does for lead.
    fieldMap: { id: "name", party: "party_name", status: "status", total: "grand_total", date: "transaction_date", owner: "owner", modified: "modified" },
  },
  sales_order: {
    doctype: "Sales Order",
    fieldMap: { id: "name", customer: "customer", status: "status", total: "grand_total", date: "transaction_date", owner: "owner", modified: "modified" },
  },
  sales_invoice: {
    doctype: "Sales Invoice",
    fieldMap: { id: "name", customer: "customer", status: "status", total: "grand_total", due_date: "due_date", owner: "owner", modified: "modified" },
  },
};
