import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * HR training curation metadata.
 */
export const HR_TRAINING: ModuleTrainingConfig = {
  module: "hr",
  pseudonymizeFields: ["employee", "applicant_name", "email", "phone"],
  retentionDays: 180,
  notes: "Employee/applicant identity is direct PII (and salary/advance data is especially sensitive) — strip or hash before any fine-tuning export, per TRAINING_PLAN.md's governance notes. Shorter retention than most modules given the sensitivity.",
};
