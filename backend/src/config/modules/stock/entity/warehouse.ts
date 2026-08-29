import { EntityConfig } from "../../../../core/types";

export const WAREHOUSE_ENTITY: EntityConfig = {
    entityKey: "warehouse",
    module: "stock",
    toolPrefix: "warehouse",
    canonicalFields: ["id", "display_name", "is_group", "disabled"],
    operations: ["list", "get"],
    description: "Storage locations",
  };
