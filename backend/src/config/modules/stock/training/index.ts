import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * Stock training curation metadata.
 */
export const STOCK_TRAINING: ModuleTrainingConfig = {
  module: "stock",
  pseudonymizeFields: ["supplier"],
  retentionDays: 365,
  notes: "Stock movement/valuation patterns have lasting analytical value; supplier identity on batch/item_price rows is the only real PII-adjacent field to strip before any fine-tuning export.",
};
