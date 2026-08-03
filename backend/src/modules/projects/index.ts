import { MCPModule } from "../../core/types";
import { workflowActionStore } from "../../core/workflowActionStore";

/**
 * STUB — external project-tracking MCP (a Linear-style issue tracker,
 * not ERPNext's own Project doctype). "list" is a placeholder. "comment"
 * DOES actually record a comment (durably, via workflowActionStore) once
 * the user has confirmed the drafted text in chat - same discipline as
 * email.send/tickets.resolve.
 */
// Named "project_issue", NOT "project" - the generic ERPNext Project
// entity module (see config/entities.config.ts, entityModuleFactory.ts)
// already registers module name "project" for ERPNext's own Project
// doctype. This is a different thing entirely: a Linear-style issue
// tracker, external to ERPNext. Same name would collide at boot
// (moduleRegistry.register throws "already registered").
export const projectsModule: MCPModule = {
  name: "project_issue",
  description: "Read project issues and post comments (external MCP, Linear-style issue tracker)",
  tools: [
    {
      name: "project_issue.list",
      description: "List project issues assigned to the current user",
      module: "project_issue",
      parameters: { type: "object", properties: { status: { type: "string" } } },
      handler: async () => ({ note: "project issue MCP not yet connected — wire real API here" }),
    },
    {
      name: "project_issue.comment",
      description: "Post a comment on a project issue — only call this after the user has confirmed the drafted comment's content",
      module: "project_issue",
      parameters: {
        type: "object",
        properties: {
          issueKey: { type: "string", description: "The issue's key, e.g. ERP-101" },
          comment: { type: "string" },
        },
        required: ["issueKey", "comment"],
      },
      handler: async (args, session) => {
        const posted = await workflowActionStore.push(session.sub, {
          module: "project_issue",
          recordKey: args.issueKey,
          action: "comment",
          detail: args.comment,
        });
        return { ok: true, posted };
      },
    },
  ],
};
