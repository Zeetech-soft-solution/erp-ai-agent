import { ModuleTrainingConfig } from "../../../../core/types";

/**
 * Accounting training curation metadata.
 */
export const ACCOUNTING_TRAINING: ModuleTrainingConfig = {
  module: "accounting",
  pseudonymizeFields: ["party"],
  retentionDays: 365,
  notes: "GL/ledger patterns have lasting analytical value; strip counterparty identity (customer/supplier on gl_entry, payment_entry, bank_transaction) before any fine-tuning export.",
};
