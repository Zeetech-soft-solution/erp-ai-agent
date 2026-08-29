import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * CRM training curation metadata — one of two populated modules today
 * (the other is selling/training.ts). See core/types.ts's
 * ModuleTrainingConfig doc comment for what this is and isn't.
 */
export const CRM_TRAINING: ModuleTrainingConfig = {
  module: "crm",
  pseudonymizeFields: ["email", "phone", "display_name", "address_line1", "pincode", "company_name"],
  retentionDays: 180,
  notes: "Lead/contact/address details are direct PII — strip or hash before any fine-tuning export, per TRAINING_PLAN.md's governance notes.",
};
