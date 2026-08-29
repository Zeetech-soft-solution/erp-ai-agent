import { ErpNextEntityMapModule } from "./types";

export const QUALITY_MAP: ErpNextEntityMapModule = {
  quality_inspection: {
    doctype: "Quality Inspection",
    fieldMap: {
      id: "name", item: "item_code", status: "status", inspection_type: "inspection_type",
      reference_type: "reference_type", reference_name: "reference_name", sample_size: "sample_size",
      inspected_by: "inspected_by", date: "report_date",
    },
  },
  quality_goal: {
    doctype: "Quality Goal",
    // Fixed from a prior, unconfirmed "status" field that does not exist
    // on this doctype (confirmed against live schema — see entities.ts's
    // comment) and would have silently 404'd/returned undefined on every
    // list/get call.
    fieldMap: { id: "name", display_name: "goal", frequency: "frequency" },
  },
};
