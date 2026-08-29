import { EntityConfig } from "../../../../core/types";

export const QUALITY_GOAL_ENTITY: EntityConfig = {
    entityKey: "quality_goal",
    module: "quality",
    toolPrefix: "quality_goal",
    // No "status" field exists on this doctype (confirmed against live
    // schema) — it's a recurring review cadence, not a workflow document.
    canonicalFields: ["id", "display_name", "frequency"],
    operations: ["list", "get"],
    description: "A quality objective tracked on a recurring review cadence",
  };
