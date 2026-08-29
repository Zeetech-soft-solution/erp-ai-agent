import { EntityConfig } from "../../../../core/types";

export const TERRITORY_ENTITY: EntityConfig = {
    entityKey: "territory",
    module: "crm",
    toolPrefix: "territory",
    canonicalFields: ["id", "display_name", "is_group"],
    operations: ["list", "get"],
    description: "Sales territories",
  };
