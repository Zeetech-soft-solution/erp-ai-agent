import { EntityConfig } from "../../../../core/types";

export const ASSET_CATEGORY_ENTITY: EntityConfig = {
    entityKey: "asset_category",
    module: "assets",
    toolPrefix: "asset_category",
    canonicalFields: ["id", "display_name", "non_depreciable_category"],
    operations: ["list", "get"],
    description: "Asset categories, each defining default depreciation/accounting behavior",
  };
