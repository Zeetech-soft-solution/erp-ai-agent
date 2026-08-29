import { EntityConfig } from "../../../../core/types";

export const DESIGNATION_ENTITY: EntityConfig = {
    entityKey: "designation",
    module: "hr",
    toolPrefix: "designation",
    canonicalFields: ["id", "display_name"],
    operations: ["list", "get"],
    description: "Job designations/titles",
  };
