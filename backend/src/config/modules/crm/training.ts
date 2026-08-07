import { ModuleTrainingConfig } from "../../../core/types";

/** CRM training curation metadata — free tier: no CRM API is exposed
 *  (quotation.list is the only one), so there's no lead traffic to
 *  curate here. See core/types.ts's ModuleTrainingConfig doc comment
 *  for what this is and isn't. */
export const CRM_TRAINING: ModuleTrainingConfig = {
  module: "crm",
  pseudonymizeFields: [],
  retentionDays: 0,
  notes: "Not applicable — free tier exposes no CRM tool.",
};
