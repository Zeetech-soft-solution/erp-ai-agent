import { EntityConfig } from "../../../../core/types";

export const FISCAL_YEAR_ENTITY: EntityConfig = {
    entityKey: "fiscal_year",
    module: "accounting",
    toolPrefix: "fiscal_year",
    canonicalFields: ["id", "year_start_date", "year_end_date", "disabled"],
    operations: ["list", "get"],
    description: "Accounting fiscal years",
  };
