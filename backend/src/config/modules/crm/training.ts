import { ModuleTrainingConfig } from "../../../core/types";

/**
 * CRM training curation metadata. See core/types.ts's
 * ModuleTrainingConfig doc comment for what this is and isn't.
 */
export const CRM_TRAINING: ModuleTrainingConfig = {
  module: "crm",
  pseudonymizeFields: ["email", "phone", "display_name", "company_name"],
  retentionDays: 180,
  notes: "Lead/contact details are direct PII — strip or hash before any fine-tuning export.",
};
