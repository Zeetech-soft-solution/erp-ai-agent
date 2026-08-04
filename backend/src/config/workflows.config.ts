import { WorkflowDefinition } from "../core/types";

/**
 * Business processes as state machines — domain-agnostic shape, same
 * as entities.config.ts. Free tier: empty — lead qualification and
 * every other workflow (purchase approval, claims, admission flows,
 * etc.) is a pro-tier capability. This file stays here, empty, so the
 * shape is complete and consistent; the engine itself
 * (core/workflowEngine.ts) is fully domain-agnostic and needs no
 * changes to support any of them.
 */
export const WORKFLOW_CONFIGS: WorkflowDefinition[] = [];
