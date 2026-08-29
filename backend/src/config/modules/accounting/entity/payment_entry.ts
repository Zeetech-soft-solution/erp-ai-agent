import { EntityConfig } from "../../../../core/types";

export const PAYMENT_ENTRY_ENTITY: EntityConfig = {
    entityKey: "payment_entry",
    module: "accounting",
    toolPrefix: "payment_entry",
    canonicalFields: ["id", "party", "amount", "date", "status"],
    fieldValues: { status: ["Draft", "Submitted", "Cancelled"] },
    operations: ["list", "get"],
    description: "Payment records",
  };
