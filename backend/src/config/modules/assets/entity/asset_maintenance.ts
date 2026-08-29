import { EntityConfig } from "../../../../core/types";

export const ASSET_MAINTENANCE_ENTITY: EntityConfig = {
    entityKey: "asset_maintenance",
    module: "assets",
    toolPrefix: "asset_maintenance",
    // No header-level "status" field exists on this doctype (confirmed
    // against live schema) — status lives per-row on its Asset
    // Maintenance Task child table, not at the document level.
    canonicalFields: ["id", "asset", "maintenance_team"],
    linkFields: { asset: "asset" },
    operations: ["list", "get"],
    description: "Scheduled maintenance program/tasks against an asset",
  };
