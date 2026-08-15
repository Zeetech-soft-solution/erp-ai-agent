import { ModuleTrainingConfig } from "../../../core/types";

/**
 * Support training curation metadata — stub. Not yet curated;
 * populate pseudonymizeFields/retentionDays once this module gets real
 * business-rule coverage. Follow crm/training.ts or selling/training.ts
 * for the pattern.
 */
export const SUPPORT_TRAINING: ModuleTrainingConfig = {
  module: "support",
  pseudonymizeFields: [],
  notes: "Not yet curated.",
};
