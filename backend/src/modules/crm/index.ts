import { MCPModule } from "../../core/types";
import { systemConnector } from "../../config/system.config";

/**
 * Hand-written module for CRM entities needing logic beyond generic
 * CRUD. Every call passes session.credential — this module never acts
 * as the agent's own service account, only ever as the logged-in
 * person, same discipline as core/entityModuleFactory.ts.
 */
export const crmModule: MCPModule = {
  name: "crm",
  description: "Leads, customers, and opportunities",
  tools: [
    {
      name: "crm.list_leads",
      description: "List leads, optionally filtered by status, source, owner, company, or creation date",
      module: "crm",
      parameters: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            description: 'status is one of "Lead"/"Open"/"Replied"/"Opportunity"/"Quotation"/"Lost Quotation"/"Interested"/"Converted"/"Do Not Contact" — never a different spelling. ' +
              'The creation-date field is called "created" (NOT "created_date" or any other spelling — an unrecognized field name is silently ignored, not an error). ' +
              'A question about "new leads" (how many we got/received in a period) means WHEN the lead was created — filter on "created" alone, never combine it with a status filter. ' +
              'A lead created this month that has since progressed to "Open" or "Opportunity" is still a real new lead from this month; filtering on status="Lead" (the literal enum value, meaning "not yet contacted") would wrongly exclude it. ' +
              'Only filter on status when the question is explicitly about current workflow state (e.g. "how many leads are still untouched"), not recency.',
          },
          limit: { type: "number", description: "Max rows to return (defaults to a small page, admin-configurable — do not assume 100)" },
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
    {
      name: "crm.update_lead_status",
      description: "Update a lead's status",
      module: "crm",
      entityKey: "lead",
      ruleAction: "update",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["Lead", "Open", "Replied", "Opportunity", "Quotation", "Lost Quotation", "Interested", "Converted", "Do Not Contact"] },
        },
        required: ["id", "status"],
      },
      handler: (args, session) => systemConnector.update("lead", session.credential, args.id, { status: args.status }),
    },
    {
      name: "crm.list_customers",
      description: "List customers",
      module: "crm",
      parameters: { type: "object", properties: { filters: { type: "object" } } },
      handler: (args, session) => systemConnector.list("customer", session.credential, { filters: args?.filters }),
    },
    {
      name: "crm.list_opportunities",
      description: "List sales opportunities",
      module: "crm",
      parameters: { type: "object", properties: { filters: { type: "object" } } },
      handler: (args, session) => systemConnector.list("opportunity", session.credential, { filters: args?.filters }),
    },
    {
      name: "crm.create_opportunity",
      description: "Create a sales opportunity",
      module: "crm",
      parameters: { type: "object", properties: { party: { type: "string" }, amount: { type: "number" } }, required: ["party"] },
      handler: (args, session) => systemConnector.create("opportunity", session.credential, args),
    },
  ],
};
