import { MCPModule } from "../../core/types";

/**
 * Hand-written module for CRM entities needing logic beyond generic
 * CRUD. Every call passes session.credential — this module never acts
 * as the agent's own service account, only ever as the logged-in
 * person, same discipline as core/entityModuleFactory.ts.
 *
 * Free tier: no CRM tool is exposed — quotation.list (see
 * config/modules/selling) is the single API surface this tier ships.
 * The lead read/create surface, the extended CRM surface beyond it,
 * and everything in every other module, is a pro-tier capability —
 * see erp-agent-pro.
 */
export const crmModule: MCPModule = {
  name: "crm",
  description: "Leads",
  tools: [],
};
