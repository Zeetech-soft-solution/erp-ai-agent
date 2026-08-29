import { EntityConfig } from "../../../../core/types";

export const ASSET_DEPRECIATION_SCHEDULE_ENTITY: EntityConfig = {
    entityKey: "asset_depreciation_schedule",
    module: "assets",
    toolPrefix: "asset_depreciation_schedule",
    canonicalFields: ["id", "asset", "net_purchase_amount", "depreciation_method", "status"],
    fieldValues: { status: ["Draft", "Active", "Cancelled"] },
    linkFields: { asset: "asset" },
    operations: ["list", "get"],
    description: "The depreciation posting schedule generated for a fixed asset",
  };
