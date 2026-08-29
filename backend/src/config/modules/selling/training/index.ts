import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * Selling training curation metadata — the other populated module
 * today (alongside crm/training.ts).
 */
export const SELLING_TRAINING: ModuleTrainingConfig = {
  module: "selling",
  pseudonymizeFields: ["party", "customer"],
  retentionDays: 365,
  notes: "Deal/quotation/order value patterns have more lasting analytical value than raw contact PII, so a longer retention window than crm — still strip counterparty identity before any fine-tuning export. Applies to pos_invoice's customer field too.",
};
