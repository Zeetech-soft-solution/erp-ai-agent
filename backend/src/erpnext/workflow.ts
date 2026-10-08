import { AxiosInstance } from "axios";
import erpnextClient, { callMethod, getDoc, getDocList } from "./client";

/**
 * Reads the customer's OWN approval workflow from ERPNext (the Workflow
 * doctype), so the agent knows what a document's states mean and which
 * action comes next. Nothing is decided here: ERPNext's definition and
 * ERPNext's get_transitions() are passed through as data.
 *
 * The Workflow definition is metadata, not business data, and ERPNext
 * normally restricts reading it to System Manager, so it is read with the
 * service client (same justification as getUserRoles). Everything about a
 * specific document (its current state, the actions available NOW) runs
 * as the acting person, so ERPNext answers for that person's own roles.
 */

export interface WorkflowSummary {
  doctype: string;
  has_workflow: boolean;
  workflow_name?: string;
  state_field?: string;
  states?: { state: string; doc_status: string; editable_by: string | null }[];
  transitions?: { from: string; action: string; to: string; allowed_role: string; condition: string | null; self_approval: boolean }[];
  document?: { name: string; current_state: any; docstatus: number; actions_for_you: { action: string; next_state: string }[] };
  standard_docstatus?: Record<string, string>;
}

const DOC_STATUS: Record<string, string> = { "0": "Draft", "1": "Submitted", "2": "Cancelled" };

export function summarizeWorkflow(doctype: string, wf: any): WorkflowSummary {
  return {
    doctype,
    has_workflow: true,
    workflow_name: wf.name,
    state_field: wf.workflow_state_field,
    states: (wf.states || []).map((s: any) => ({
      state: s.state,
      doc_status: DOC_STATUS[String(s.doc_status)] ?? String(s.doc_status),
      editable_by: s.allow_edit || null,
    })),
    transitions: (wf.transitions || []).map((t: any) => ({
      from: t.state,
      action: t.action,
      to: t.next_state,
      allowed_role: t.allowed,
      condition: t.condition || null,
      self_approval: !!t.allow_self_approval,
    })),
  };
}

export async function describeWorkflow(doctype: string, userClient: AxiosInstance, id?: string): Promise<WorkflowSummary> {
  const active = await getDocList(
    "Workflow",
    { filters: JSON.stringify([["document_type", "=", doctype], ["is_active", "=", 1]]), fields: JSON.stringify(["name"]), limit_page_length: 1 },
    erpnextClient
  );

  let summary: WorkflowSummary;
  if (!active.length) {
    // No approval workflow configured: the document follows ERPNext's
    // standard docstatus lifecycle only. Returned as data, not advice.
    summary = { doctype, has_workflow: false, standard_docstatus: DOC_STATUS };
  } else {
    summary = summarizeWorkflow(doctype, await getDoc("Workflow", active[0].name, erpnextClient));
  }

  if (id) {
    const doc = await getDoc(doctype, id, userClient);
    let actions: { action: string; next_state: string }[] = [];
    if (summary.has_workflow) {
      const transitions = await callMethod<any[]>("frappe.model.workflow.get_transitions", { doc: JSON.stringify(doc) }, userClient);
      actions = (transitions || []).map((t: any) => ({ action: t.action, next_state: t.next_state }));
    }
    summary.document = {
      name: doc.name,
      current_state: summary.state_field ? doc[summary.state_field] : DOC_STATUS[String(doc.docstatus)],
      docstatus: doc.docstatus,
      actions_for_you: actions,
    };
  }
  return summary;
}
