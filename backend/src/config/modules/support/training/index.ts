import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * Support training curation metadata.
 */
export const SUPPORT_TRAINING: ModuleTrainingConfig = {
  module: "support",
  // subject/description are free text and can contain a customer's own
  // words about their problem (which may reference PII incidentally) -
  // raised_by is a direct email address. Both worth stripping before a
  // fine-tuning export, unlike e.g. quality's inspection data.
  pseudonymizeFields: ["subject", "description", "raised_by"],
  retentionDays: 365,
  notes: "Ticket resolution patterns have real analytical value (common issue types, resolution time), but subject/description/raised_by can carry customer-identifying text and should be stripped or hashed before any fine-tuning export.",
};
