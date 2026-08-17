import { ModuleTrainingConfig } from "../../../core/types";

/**
 * Selling training curation metadata — not yet curated; populate
 * pseudonymizeFields/retentionDays once this module gets real entity
 * coverage. Follow crm/training.ts for the pattern.
 */
export const SELLING_TRAINING: ModuleTrainingConfig = {
  module: "selling",
  pseudonymizeFields: [],
  notes: "Not yet curated.",
};
