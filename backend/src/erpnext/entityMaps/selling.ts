import { ErpNextEntityMapModule } from "./types";

/** Free tier: quotation only — sales_order/sales_invoice/pos_invoice/
 *  pricing_rule field mappings are pro-tier. */
export const SELLING_MAP: ErpNextEntityMapModule = {
  quotation: {
    doctype: "Quotation",
    // owner/modified are standard Frappe framework fields on every
    // doctype - added so the notification poll (see
    // core/erpnextNotificationSync.ts) can filter "mine, changed since
    // I last checked" the same way it does for lead.
    fieldMap: { id: "name", party: "party_name", status: "status", total: "grand_total", date: "transaction_date", owner: "owner", modified: "modified" },
  },
};
