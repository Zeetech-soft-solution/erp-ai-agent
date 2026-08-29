import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * Quality training curation metadata.
 */
export const QUALITY_TRAINING: ModuleTrainingConfig = {
  module: "quality",
  pseudonymizeFields: [],
  retentionDays: 365,
  notes: "Inspection/quality-goal patterns have lasting analytical value and carry no customer/employee PII — no field-level stripping needed before a fine-tuning export.",
};
