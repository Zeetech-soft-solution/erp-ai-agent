import { WorkflowDefinition } from "../core/types";

/**
 * Business processes as state machines — domain-agnostic shape, same
 * as entities.config.ts. This one example (lead qualification) proves
 * the pattern against ERPNext today; the SAME shape describes a
 * purchase approval chain, an insurance claim, or a patient admission
 * flow in a completely different vertical tomorrow — only the states/
 * actions/roles change, never the engine.
 */
export const WORKFLOW_CONFIGS: WorkflowDefinition[] = [
  {
    key: "lead_qualification",
    entityKey: "lead",
    statusField: "status",
    description: "Move a lead through qualification to conversion",
    transitions: [
      { action: "qualify", from: ["Open", "Lead"], to: "Interested", description: "Mark a lead as interested/qualified" },
      { action: "disqualify", from: ["Open", "Lead", "Interested"], to: "Do Not Contact", description: "Disqualify a lead" },
      {
        action: "convert",
        from: ["Interested"],
        to: "Converted",
        allowedRoles: ["Sales Manager", "System Manager"],
        description: "Convert a qualified lead — requires manager approval",
      },
    ],
  },

  // Append more workflows here as you cover more processes:
  // { key: "purchase_approval", entityKey: "purchase_order", statusField: "status",
  //   transitions: [
  //     { action: "submit", from: ["Draft"], to: "Pending Approval" },
  //     { action: "approve", from: ["Pending Approval"], to: "Approved", allowedRoles: ["Purchasing Manager"] },
  //     { action: "reject", from: ["Pending Approval"], to: "Rejected", allowedRoles: ["Purchasing Manager"] },
  //   ] },
];
