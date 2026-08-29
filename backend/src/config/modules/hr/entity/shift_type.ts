import { EntityConfig } from "../../../../core/types";

export const SHIFT_TYPE_ENTITY: EntityConfig = {
    entityKey: "shift_type",
    module: "hr",
    toolPrefix: "shift_type",
    canonicalFields: ["id", "start_time", "end_time", "enable_auto_attendance"],
    operations: ["list", "get"],
    description: "A defined work shift (e.g. Morning, Evening) with start/end times",
  };
