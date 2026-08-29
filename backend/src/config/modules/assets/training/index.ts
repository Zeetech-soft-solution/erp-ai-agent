import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * Assets training curation metadata.
 */
export const ASSETS_TRAINING: ModuleTrainingConfig = {
  module: "assets",
  pseudonymizeFields: [],
  retentionDays: 365,
  notes: "Fixed-asset/depreciation patterns have lasting analytical value and carry no customer/employee PII — no field-level stripping needed before a fine-tuning export.",
};
