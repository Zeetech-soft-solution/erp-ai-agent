import { EntityConfig } from "../../../../core/types";

export const ASSET_ENTITY: EntityConfig = {
    entityKey: "asset",
    module: "assets",
    toolPrefix: "asset",
    canonicalFields: ["id", "display_name", "category", "status", "purchase_date", "total_asset_cost"],
    fieldValues: { status: ["Draft", "Submitted", "Cancelled", "Partially Depreciated", "Fully Depreciated", "Sold", "Scrapped", "In Maintenance", "Out of Order", "Issue", "Receipt", "Capitalized", "Work In Progress"] },
    linkFields: { category: "asset_category" },
    operations: ["list", "get"],
    description: "Fixed assets",
  };
