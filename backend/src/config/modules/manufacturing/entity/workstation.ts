import { EntityConfig } from "../../../../core/types";

export const WORKSTATION_ENTITY: EntityConfig = {
    entityKey: "workstation",
    module: "manufacturing",
    toolPrefix: "workstation",
    canonicalFields: ["id", "display_name", "status", "hour_rate", "warehouse"],
    // Machine state, not a workflow status like every other entity here —
    // still a real fixed enum, so documented the same way.
    fieldValues: { status: ["Production", "Off", "Idle", "Problem", "Maintenance", "Setup"] },
    linkFields: { warehouse: "warehouse" },
    operations: ["list", "get"],
    description: "A shop-floor work center (line/station) where an operation is carried out",
  };
