import { EntityConfig } from "../../../../core/types";

export const BANK_ACCOUNT_ENTITY: EntityConfig = {
    entityKey: "bank_account",
    module: "accounting",
    toolPrefix: "bank_account",
    canonicalFields: ["id", "display_name", "bank", "is_default", "account"],
    linkFields: { account: "account" },
    operations: ["list", "get"],
    description: "A company's bank accounts",
  };
