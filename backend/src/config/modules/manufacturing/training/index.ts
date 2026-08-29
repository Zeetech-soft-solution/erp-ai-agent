import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * Manufacturing training curation metadata.
 */
export const MANUFACTURING_TRAINING: ModuleTrainingConfig = {
  module: "manufacturing",
  pseudonymizeFields: [],
  retentionDays: 365,
  notes: "Production/costing patterns have lasting analytical value and carry no customer/employee PII — no field-level stripping needed before a fine-tuning export.",
};
