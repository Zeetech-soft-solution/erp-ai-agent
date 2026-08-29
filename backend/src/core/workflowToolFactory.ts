import { MCPModule, ToolDefinition, WorkflowDefinition } from "./types";
import { workflowEngine, WorkflowError } from "./workflowEngine";

/**
 * Turns each workflow's transitions into ordinary MCP tools — a
 * workflow action is just another tool from the gateway/reasoning
 * engine's point of view (e.g. "lead_qualification.qualify"), so it
 * gets the exact same role-gating, logging, and LLM tool-calling
 * treatment as a plain CRUD tool. Role gating happens TWICE by design:
 * once at the gateway (allowed_tools, same as any tool) and once
 * inside workflowEngine.transition (transition.allowedRoles, for
 * cases where a role can see/call the tool but a specific transition
 * still needs a tighter check, e.g. only a manager can "approve" even
 * if their role can generally use the workflow).
 */
export function buildWorkflowModule(workflow: WorkflowDefinition): MCPModule {
  const tools: ToolDefinition[] = workflow.transitions.map((t) => ({
    name: `${workflow.key}.${t.action}`,
    description: t.description || `Move a ${workflow.entityKey} from ${t.from.join("/")} to ${t.to} via "${t.action}"`,
    module: workflow.key,
    parameters: { type: "object", properties: { entity_id: { type: "string" } }, required: ["entity_id"] },
    handler: async (args, session) => {
      try {
        return await workflowEngine.transition(session, workflow.key, args.entity_id, t.action);
      } catch (err) {
        if (err instanceof WorkflowError) return { error: err.message };
        throw err;
      }
    },
  }));

  return { name: workflow.key, description: workflow.description || `${workflow.key} workflow`, tools };
}

export function buildWorkflowModules(workflows: WorkflowDefinition[]): MCPModule[] {
  return workflows.map(buildWorkflowModule);
}
