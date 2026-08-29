import { WorkflowDefinition, WorkflowTransition, Session } from "./types";
import { systemConnector } from "../config/system.config";

export class WorkflowError extends Error {}

/**
 * Domain-agnostic state-transition engine. Operates purely on canonical
 * entity fields through systemConnector, always AS the acting person
 * (session.credential) so a workflow transition shows up in the
 * underlying system's audit trail as something they did, not the agent's
 * service account. Has no idea whether the entity underneath is an
 * ERPNext Lead, an SAP sales document, or a hospital admission record.
 */
class WorkflowEngine {
  private workflows = new Map<string, WorkflowDefinition>();

  register(workflow: WorkflowDefinition) {
    this.workflows.set(workflow.key, workflow);
  }

  getAll(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  get(key: string): WorkflowDefinition | undefined {
    return this.workflows.get(key);
  }

  async transition(session: Session, workflowKey: string, entityId: string, action: string) {
    const workflow = this.workflows.get(workflowKey);
    if (!workflow) throw new WorkflowError(`Unknown workflow: ${workflowKey}`);

    const entity = await systemConnector.get(workflow.entityKey, session.credential, entityId);
    const currentStatus = entity[workflow.statusField];

    const transition = workflow.transitions.find(
      (t) => t.action === action && t.from.includes(currentStatus)
    );
    if (!transition) {
      throw new WorkflowError(
        `Action "${action}" is not valid from status "${currentStatus}" in workflow "${workflowKey}"`
      );
    }

    if (transition.allowedRoles && !transition.allowedRoles.some((r) => session.erpnext_roles.includes(r))) {
      throw new WorkflowError(`Role required for "${action}": ${transition.allowedRoles.join(" or ")}`);
    }

    return systemConnector.update(workflow.entityKey, session.credential, entityId, { [workflow.statusField]: transition.to });
  }

  /** Exposes valid next actions for an entity's current state — useful
   *  for a UI ("what can I do with this record right now") or for the
   *  LLM's own DISPLAY_INTENT next_steps suggestion. */
  async availableActions(session: Session, workflowKey: string, entityId: string): Promise<WorkflowTransition[]> {
    const workflow = this.workflows.get(workflowKey);
    if (!workflow) return [];
    const entity = await systemConnector.get(workflow.entityKey, session.credential, entityId);
    const currentStatus = entity[workflow.statusField];
    return workflow.transitions.filter((t) => t.from.includes(currentStatus));
  }
}

export const workflowEngine = new WorkflowEngine();
