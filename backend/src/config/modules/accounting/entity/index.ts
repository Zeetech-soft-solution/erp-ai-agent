import { JOURNAL_ENTRY_ENTITY } from "./journal_entry";
import { PAYMENT_ENTRY_ENTITY } from "./payment_entry";
import { ACCOUNT_ENTITY } from "./account";
import { COST_CENTER_ENTITY } from "./cost_center";
import { GL_ENTRY_ENTITY } from "./gl_entry";
import { FISCAL_YEAR_ENTITY } from "./fiscal_year";
import { BANK_TRANSACTION_ENTITY } from "./bank_transaction";
import { BANK_ACCOUNT_ENTITY } from "./bank_account";
import { EntityConfig } from "../../../../core/types";

export const ACCOUNTING_ENTITIES: EntityConfig[] = [
  JOURNAL_ENTRY_ENTITY,
  PAYMENT_ENTRY_ENTITY,
  ACCOUNT_ENTITY,
  COST_CENTER_ENTITY,
  GL_ENTRY_ENTITY,
  FISCAL_YEAR_ENTITY,
  BANK_TRANSACTION_ENTITY,
  BANK_ACCOUNT_ENTITY,
];
