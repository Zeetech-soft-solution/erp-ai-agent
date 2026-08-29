import { EntityConfig } from "../../../../core/types";

export const COST_CENTER_ENTITY: EntityConfig = {
    entityKey: "cost_center",
    module: "accounting",
    toolPrefix: "cost_center",
    canonicalFields: ["id", "display_name", "is_group", "disabled"],
    operations: ["list", "get"],
    description: "Cost centers for expense/revenue tracking",
  };
