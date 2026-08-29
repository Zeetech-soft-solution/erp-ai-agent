import { EntityConfig } from "../../../../core/types";

export const OPERATION_ENTITY: EntityConfig = {
    entityKey: "operation",
    module: "manufacturing",
    toolPrefix: "operation",
    canonicalFields: ["id", "workstation", "description"],
    linkFields: { workstation: "workstation" },
    operations: ["list", "get"],
    description: "A standard manufacturing operation (e.g. SMT placement, testing) used on BOMs and work orders",
  };
