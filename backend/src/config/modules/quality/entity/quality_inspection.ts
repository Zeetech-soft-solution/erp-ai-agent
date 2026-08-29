import { EntityConfig } from "../../../../core/types";

export const QUALITY_INSPECTION_ENTITY: EntityConfig = {
    entityKey: "quality_inspection",
    module: "quality",
    toolPrefix: "quality_inspection",
    canonicalFields: ["id", "item", "status", "inspection_type", "reference_type", "reference_name", "sample_size", "inspected_by", "date"],
    fieldValues: { status: ["Accepted", "Rejected", "Cancelled"] },
    // reference_type/reference_name are a Dynamic Link (Purchase Receipt,
    // Delivery Note, ...) — deliberately not in linkFields, same
    // polymorphic reasoning as gl_entry's "party" above.
    linkFields: { item: "item" },
    // A real, simple flat-field creation flow (inspection_type +
    // reference doc + item_code + sample_size + status) — unlike most
    // transactional documents in this codebase, no child-table line
    // items are needed.
    // inspected_by (a Link to User, required) has no sensible system
    // default — the caller must supply the ERPNext username of the
    // person actually performing the inspection.
    createFields: ["item", "inspection_type", "reference_type", "reference_name", "sample_size", "inspected_by"],
    description: "Incoming/outgoing/in-process quality inspection against a purchase receipt, delivery note, or similar reference document",
  };
