import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * Buying training curation metadata.
 */
export const BUYING_TRAINING: ModuleTrainingConfig = {
  module: "buying",
  pseudonymizeFields: ["supplier"],
  retentionDays: 365,
  notes: "Procurement value/cadence patterns have more lasting analytical value than raw counterparty identity — strip supplier identity before any fine-tuning export.",
};
