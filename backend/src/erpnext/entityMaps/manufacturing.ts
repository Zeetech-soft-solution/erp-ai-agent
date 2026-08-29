import { ErpNextEntityMapModule } from "./types";

export const MANUFACTURING_MAP: ErpNextEntityMapModule = {
  bom: {
    doctype: "BOM",
    fieldMap: { id: "name", item: "item", quantity: "quantity", is_active: "is_active", is_default: "is_default", total_cost: "total_cost" },
  },
  work_order: {
    doctype: "Work Order",
    fieldMap: {
      id: "name", item: "production_item", bom: "bom_no", quantity: "qty", status: "status",
      planned_start_date: "planned_start_date", actual_start_date: "actual_start_date", total_operating_cost: "total_operating_cost",
      date: "planned_start_date",
    },
  },
  job_card: {
    doctype: "Job Card",
    fieldMap: {
      id: "name", work_order: "work_order", operation: "operation", status: "status",
      expected_start_date: "expected_start_date", expected_end_date: "expected_end_date", actual_start_date: "actual_start_date",
      date: "expected_start_date",
    },
  },
  production_plan: {
    doctype: "Production Plan",
    fieldMap: {
      id: "name", status: "status", date: "posting_date", from_date: "from_date", to_date: "to_date",
      total_planned_qty: "total_planned_qty", total_produced_qty: "total_produced_qty",
    },
  },
  workstation: {
    doctype: "Workstation",
    fieldMap: { id: "name", display_name: "workstation_name", status: "status", hour_rate: "hour_rate", warehouse: "warehouse" },
  },
  operation: {
    doctype: "Operation",
    fieldMap: { id: "name", workstation: "workstation", description: "description" },
  },
};
