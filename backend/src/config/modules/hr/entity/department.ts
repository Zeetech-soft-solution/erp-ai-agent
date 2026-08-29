import { EntityConfig } from "../../../../core/types";

export const DEPARTMENT_ENTITY: EntityConfig = {
    entityKey: "department",
    module: "hr",
    toolPrefix: "department",
    canonicalFields: ["id", "display_name", "is_group", "disabled"],
    operations: ["list", "get"],
    description: "Organizational departments",
  };
