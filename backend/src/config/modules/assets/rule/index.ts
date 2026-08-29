import { RuleSet } from "../../../../core/types";

/**
 * Assets module rules — deliberately empty, not a stub awaiting
 * coverage. Every asset entity (asset, asset_maintenance,
 * asset_category, asset_depreciation_schedule — see entities.ts) is
 * list/get only: assets are capitalized via a Purchase Invoice/Receipt
 * or a dedicated journal entry, never a simple flat create, and
 * depreciation schedules/categories are
 * system-generated or setup-time master data. A RuleSet only ever fires
 * on a create/update tool, so there's nothing here to register against.
 */
export const ASSETS_RULES: RuleSet[] = [];
