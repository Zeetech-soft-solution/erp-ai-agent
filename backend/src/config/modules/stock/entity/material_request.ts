import { EntityConfig } from "../../../../core/types";

export const MATERIAL_REQUEST_ENTITY: EntityConfig = {
    entityKey: "material_request",
    module: "stock",
    toolPrefix: "material_request",
    canonicalFields: ["id", "request_type", "status", "date", "schedule_date", "per_ordered"],
    fieldValues: { status: ["Draft", "Submitted", "Stopped", "Cancelled", "Pending", "Partially Ordered", "Partially Received", "Ordered", "Issued", "Transferred", "Received"] },
    createFields: ["request_type"],
    lineItems: { canonicalField: "items", itemFields: ["item_code", "qty", "uom", "warehouse", "schedule_date"] },
    description: "Internal requests to purchase or transfer material",
  };
