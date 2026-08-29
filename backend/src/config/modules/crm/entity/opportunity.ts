import { EntityConfig } from "../../../../core/types";

export const OPPORTUNITY_ENTITY: EntityConfig = {
    entityKey: "opportunity",
    module: "crm",
    toolPrefix: "opportunity",
    canonicalFields: ["id", "party", "status", "amount", "territory", "date"],
    fieldValues: { status: ["Open", "Quotation", "Converted", "Lost", "Replied", "Closed"] },
    createFields: ["party", "amount"],
    description: "Sales opportunities",
  };
