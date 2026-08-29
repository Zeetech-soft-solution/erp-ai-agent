import { EntityConfig } from "../../../../core/types";

export const SUPPLIER_ENTITY: EntityConfig = {
    entityKey: "supplier",
    module: "buying",
    toolPrefix: "supplier",
    // phone/email added 2026-08-09 alongside erpnextConnector.ts's
    // get()-time primary-contact backfill (see its doc comment) - the
    // header field is a Read Only mirror that's blank in this dataset,
    // so without the backfill these would always read null.
    canonicalFields: ["id", "display_name", "group", "phone", "email"],
    operations: ["list", "get"],
    description: "Suppliers/vendors",
  };
