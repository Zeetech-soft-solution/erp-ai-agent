import { ModuleTrainingConfig } from "../core/types";
import { CRM_TRAINING } from "./modules/crm/training";
import { SELLING_TRAINING } from "./modules/selling/training";
import { BUYING_TRAINING } from "./modules/buying/training";
import { STOCK_TRAINING } from "./modules/stock/training";
import { ACCOUNTING_TRAINING } from "./modules/accounting/training";
import { HR_TRAINING } from "./modules/hr/training";
import { MANUFACTURING_TRAINING } from "./modules/manufacturing/training";
import { PROJECTS_TRAINING } from "./modules/projects/training";
import { ASSETS_TRAINING } from "./modules/assets/training";
import { QUALITY_TRAINING } from "./modules/quality/training";
import { SUPPORT_TRAINING } from "./modules/support/training";

/**
 * Per-module training curation metadata, assembled from every module's
 * training.ts (config/modules/<name>/training.ts), same convention as
 * entities.config.ts / rules.config.ts. Only crm and selling are
 * curated today — see core/types.ts's ModuleTrainingConfig doc comment
 * for what this data is for. Not wired into any runtime path — this is
 * the input the curation/export tooling docs/TRAINING_PLAN.md's Phase
 * 2 describes will eventually read, not something the reasoning engine
 * or gateway need at request time.
 */
export const TRAINING_CONFIGS: ModuleTrainingConfig[] = [
  CRM_TRAINING,
  SELLING_TRAINING,
  BUYING_TRAINING,
  STOCK_TRAINING,
  ACCOUNTING_TRAINING,
  HR_TRAINING,
  MANUFACTURING_TRAINING,
  PROJECTS_TRAINING,
  ASSETS_TRAINING,
  QUALITY_TRAINING,
  SUPPORT_TRAINING,
];
