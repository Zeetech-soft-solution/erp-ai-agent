import { ErpNextEntityMapModule } from "./types";

export const STOCK_MAP: ErpNextEntityMapModule = {
  item: {
    doctype: "Item",
    fieldMap: { id: "name", display_name: "item_name", group: "item_group", uom: "stock_uom", disabled: "disabled" },
  },
  warehouse: {
    doctype: "Warehouse",
    fieldMap: { id: "name", display_name: "warehouse_name", is_group: "is_group", disabled: "disabled" },
  },
  delivery_note: {
    doctype: "Delivery Note",
    fieldMap: {
      id: "name", customer: "customer", status: "status", total: "grand_total", date: "posting_date",
      per_billed: "per_billed", per_returned: "per_returned",
    },
  },
  stock_entry: {
    doctype: "Stock Entry",
    // Fixed from a prior, unconfirmed "status" field that does not exist
    // on this doctype (confirmed against live schema — see entities.ts's
    // comment) and 417'd every list/get call with "Field not permitted
    // in query: status".
    fieldMap: {
      id: "name", entry_type: "stock_entry_type", purpose: "purpose", date: "posting_date",
      work_order: "work_order", from_warehouse: "from_warehouse", to_warehouse: "to_warehouse",
    },
  },
  material_request: {
    doctype: "Material Request",
    fieldMap: {
      id: "name", request_type: "material_request_type", status: "status", date: "transaction_date",
      schedule_date: "schedule_date", per_ordered: "per_ordered",
    },
    // Material Request Item's field names are identical to the
    // canonical ones — confirmed against the live child-table schema.
    childTables: {
      items: {
        nativeField: "items",
        fieldMap: { item_code: "item_code", qty: "qty", uom: "uom", warehouse: "warehouse", schedule_date: "schedule_date" },
      },
    },
  },
  stock_reconciliation: {
    doctype: "Stock Reconciliation",
    fieldMap: { id: "name", purpose: "purpose", date: "posting_date", difference_amount: "difference_amount" },
  },
  batch: {
    doctype: "Batch",
    fieldMap: { id: "name", item: "item", manufacturing_date: "manufacturing_date", expiry_date: "expiry_date", batch_qty: "batch_qty", disabled: "disabled", date: "manufacturing_date" },
  },
  item_price: {
    doctype: "Item Price",
    fieldMap: { id: "name", item: "item_code", price_list: "price_list", rate: "price_list_rate", buying: "buying", selling: "selling", valid_from: "valid_from", valid_upto: "valid_upto", date: "valid_from" },
  },
  bin: {
    doctype: "Bin",
    fieldMap: {
      id: "name", item: "item_code", warehouse: "warehouse", actual_qty: "actual_qty",
      reserved_qty: "reserved_qty", ordered_qty: "ordered_qty", projected_qty: "projected_qty", valuation_rate: "valuation_rate",
    },
  },
};
