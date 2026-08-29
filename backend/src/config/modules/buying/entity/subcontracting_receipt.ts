import { EntityConfig } from "../../../../core/types";

export const SUBCONTRACTING_RECEIPT_ENTITY: EntityConfig = {
    entityKey: "subcontracting_receipt",
    module: "buying",
    toolPrefix: "subcontracting_receipt",
    canonicalFields: ["id", "supplier", "status", "date"],
    fieldValues: { status: ["Draft", "Completed", "Return", "Return Issued", "Cancelled", "Closed"] },
    linkFields: { supplier: "supplier" },
    operations: ["list", "get"],
    description: "Receipt of finished goods back from a subcontractor",
  };
