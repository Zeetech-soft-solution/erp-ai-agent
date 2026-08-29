import { ErpNextEntityMapModule } from "./types";

export const SELLING_MAP: ErpNextEntityMapModule = {
  quotation: {
    doctype: "Quotation",
    // owner/modified - standard Frappe framework fields on every doctype -
    // added so the notification poll (see core/erpnextNotificationSync.ts)
    // can filter "mine, changed since I last checked" the same way it does
    // for lead.
    fieldMap: {
      id: "name", party: "party_name", status: "status", total: "grand_total", date: "transaction_date",
      valid_till: "valid_till", owner: "owner", modified: "modified",
    },
    // Quotation Item's field names happen to be identical to the
    // canonical ones (item_code, qty, uom, rate, warehouse) — confirmed
    // against the live child-table schema, not assumed.
    childTables: {
      items: { nativeField: "items", fieldMap: { item_code: "item_code", qty: "qty", uom: "uom", rate: "rate", warehouse: "warehouse" } },
    },
  },
  sales_order: {
    doctype: "Sales Order",
    fieldMap: {
      id: "name", customer: "customer", status: "status", total: "grand_total", date: "transaction_date",
      delivery_date: "delivery_date", per_delivered: "per_delivered", per_billed: "per_billed",
      owner: "owner", modified: "modified",
    },
    childTables: {
      items: {
        nativeField: "items",
        fieldMap: { item_code: "item_code", qty: "qty", uom: "uom", rate: "rate", warehouse: "warehouse", delivery_date: "delivery_date" },
      },
    },
  },
  sales_invoice: {
    doctype: "Sales Invoice",
    fieldMap: {
      id: "name", customer: "customer", status: "status", total: "grand_total",
      outstanding_amount: "outstanding_amount", due_date: "due_date", date: "posting_date",
    },
  },
  pos_invoice: {
    doctype: "POS Invoice",
    fieldMap: { id: "name", customer: "customer", status: "status", total: "grand_total", date: "posting_date", outstanding_amount: "outstanding_amount" },
  },
  pricing_rule: {
    doctype: "Pricing Rule",
    fieldMap: {
      id: "name", display_name: "title", applicable_for: "applicable_for", discount_percentage: "discount_percentage",
      valid_from: "valid_from", valid_upto: "valid_upto", disable: "disable", date: "valid_from",
    },
  },
};
