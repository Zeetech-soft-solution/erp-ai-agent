import { ErpNextEntityMapModule } from "./types";

export const ASSETS_MAP: ErpNextEntityMapModule = {
  asset: {
    doctype: "Asset",
    fieldMap: {
      id: "name", display_name: "asset_name", category: "asset_category", status: "status",
      purchase_date: "purchase_date", total_asset_cost: "total_asset_cost", date: "purchase_date",
    },
  },
  asset_maintenance: {
    doctype: "Asset Maintenance",
    // Fixed from a prior, unconfirmed "maintenance_status" field that
    // does not exist on this doctype (confirmed against live schema —
    // see entities.ts's comment) and would have silently 404'd/returned
    // undefined on every list/get call.
    fieldMap: { id: "name", asset: "asset_name", maintenance_team: "maintenance_team" },
  },
  asset_category: {
    doctype: "Asset Category",
    fieldMap: { id: "name", display_name: "asset_category_name", non_depreciable_category: "non_depreciable_category" },
  },
  asset_depreciation_schedule: {
    doctype: "Asset Depreciation Schedule",
    fieldMap: { id: "name", asset: "asset", net_purchase_amount: "net_purchase_amount", depreciation_method: "depreciation_method", status: "status" },
  },
};
