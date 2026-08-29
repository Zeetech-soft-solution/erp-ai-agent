import { MCPModule } from "../../core/types";
import { workflowActionStore } from "../../core/workflowActionStore";
import { systemConnector } from "../../config/system.config";

/**
 * 2026-08-23, explicit user request: switched from the simulated
 * businessEmailStore/workflowActionStore-only stub to the REAL ERPNext
 * "issue" entity (systemConnector.list/update) — this now actually
 * reads/writes real Issue records, not a separate simulated store.
 *
 * tickets.resolve is a HYBRID, not a full switch: ISSUE_ENTITY's real
 * canonicalFields (config/modules/support/entity/issue.ts) are
 * ["id","subject","customer","customer_name","contact","raised_by",
 * "status","priority","opening_date","description"] — there is no real
 * resolution-notes field. toNativeData() (erpnext/entityMap.ts) silently
 * DROPS any canonicalData key with no native mapping (a console.warn,
 * not an error) — passing resolutionNote straight into
 * systemConnector.update would silently lose it, not save it. So:
 * status:"Resolved" goes to the REAL ERPNext record (a real field, a
 * real mutation); resolutionNote stays in workflowActionStore (the
 * durable audit log this module already used) since there's nowhere
 * real on the Issue doctype itself to put free text. Same reasoning for
 * tickets.list dropping "assigned_to" as a filter — also not a real
 * canonical field on this entity (Frappe assignment is a separate
 * mechanism, not a plain field) — filtering on it would silently no-op.
 */
export const ticketsModule: MCPModule = {
  name: "tickets",
  description: "Support tickets (Issue doctype).",
  tools: [
    {
      name: "tickets.list",
      description: `List support tickets. filters: status, priority.`,
      module: "tickets",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          priority: { type: "string" },
        },
      },
      handler: async (args, session) => {
        const filters: any = {};
        if (args.status) filters.status = args.status;
        if (args.priority) filters.priority = args.priority;
        return systemConnector.list("issue", session.credential, { filters });
      },
    },
    {
      name: "tickets.resolve",
      description: `Resolve support ticket. ticketId + resolutionNote. Confirm first.`,
      module: "tickets",
      entityKey: "issue",
      ruleAction: "update",
      parameters: {
        type: "object",
        properties: {
          ticketId: { type: "string" },
          resolutionNote: { type: "string" },
        },
        required: ["ticketId", "resolutionNote"],
      },
      handler: async (args, session) => {
        const updated = await systemConnector.update("issue", session.credential, args.ticketId, { status: "Resolved" });
        const resolved = await workflowActionStore.push(session.sub, {
          module: "tickets",
          recordKey: args.ticketId,
          action: "resolve",
          detail: args.resolutionNote,
        });
        return { ok: true, issue: updated, resolved };
      },
    },
  ],
};
