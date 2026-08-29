import { EntityConfig } from "../../../../core/types";

export const BATCH_ENTITY: EntityConfig = {
    entityKey: "batch",
    module: "stock",
    toolPrefix: "batch",
    canonicalFields: ["id", "item", "manufacturing_date", "expiry_date", "batch_qty", "disabled"],
    linkFields: { item: "item" },
    operations: ["list", "get"],
    description: "Traceable lot of a batch-tracked item (e.g. a PCB/sub-assembly production lot)",
  };
