import { EntityConfig } from "../../../../core/types";

export const BOM_ENTITY: EntityConfig = {
    entityKey: "bom",
    module: "manufacturing",
    toolPrefix: "bom",
    canonicalFields: ["id", "item", "quantity", "is_active", "is_default", "total_cost"],
    linkFields: { item: "item" },
    operations: ["list", "get"],
    description: "Bills of material",
  };
