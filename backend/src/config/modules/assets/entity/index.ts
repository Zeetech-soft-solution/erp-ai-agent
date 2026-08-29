import { ASSET_ENTITY } from "./asset";
import { ASSET_MAINTENANCE_ENTITY } from "./asset_maintenance";
import { ASSET_CATEGORY_ENTITY } from "./asset_category";
import { ASSET_DEPRECIATION_SCHEDULE_ENTITY } from "./asset_depreciation_schedule";
import { EntityConfig } from "../../../../core/types";

export const ASSETS_ENTITIES: EntityConfig[] = [
  ASSET_ENTITY,
  ASSET_MAINTENANCE_ENTITY,
  ASSET_CATEGORY_ENTITY,
  ASSET_DEPRECIATION_SCHEDULE_ENTITY,
];
