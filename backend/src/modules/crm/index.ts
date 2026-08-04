import { MCPModule } from "../../core/types";
import { systemConnector } from "../../config/system.config";

/**
 * Hand-written module for CRM entities needing logic beyond generic
 * CRUD. Every call passes session.credential — this module never acts
 * as the agent's own service account, only ever as the logged-in
 * person, same discipline as core/entityModuleFactory.ts.
 *
 * Free tier: only the lead read/create surface is implemented here.
 * The extended CRM surface (status updates, customers, opportunities,
 * and everything beyond it across every other module) is a pro-tier
 * capability — see erp-agent-pro.
 */
export const crmModule: MCPModule = {
  name: "crm",
  description: "Leads",
  tools: [
    {
      name: "crm.list_leads",
      description: "List leads, optionally filtered by status, source, owner, company, or creation date",
      module: "crm",
      parameters: {
        type: "object",
        properties: {
          filters: { type: "object" },
          limit: { type: "number", description: "Max rows to return (default 100)" },
          offset: { type: "number", description: "Rows to skip, for paging past the first page" },
        },
      },
      handler: (args, session) =>
        systemConnector.list("lead", session.credential, { filters: args?.filters, limit: args?.limit, offset: args?.offset }),
    },
    {
      name: "crm.get_lead",
      description: "Get a single lead by id",
      module: "crm",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      handler: (args, session) => systemConnector.get("lead", session.credential, args.id),
    },
    {
      name: "crm.create_lead",
      description: "Create a new lead",
      module: "crm",
      entityKey: "lead",
      ruleAction: "create",
      parameters: { type: "object", properties: { display_name: { type: "string" }, email: { type: "string" }, phone: { type: "string" } }, required: ["display_name"] },
      handler: (args, session) => systemConnector.create("lead", session.credential, args),
    },
  ],
};
