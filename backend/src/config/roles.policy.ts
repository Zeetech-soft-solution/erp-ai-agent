import { RolePolicyProvider } from "../core/types";

/**
 * Static, file-based policy — swap this for a DatabaseRolePolicyProvider
 * later (reading from an ERPNext-managed doctype or your own admin UI)
 * WITHOUT touching gateway.ts or the auth flow, because both only ever
 * depend on the RolePolicyProvider interface, never this file.
 *
 * One role, granting the CRM sample module's real tool surface — leads,
 * contacts, opportunities, customers, territories, and the lead
 * qualification workflow. A tool being registered by entityModuleFactory
 * or a hand-written module never implies access; it must also be
 * granted here. To add your own role/tool grants as you extend
 * entities.config.ts, follow this exact shape — key is the ERPNext role
 * name (must match exactly, a mismatch here silently grants nothing),
 * value is the list of tool names to allow.
 */
const ROLE_TOOL_MAP: Record<string, string[]> = {
  "Sales User": [
    "crm.list_leads",
    "crm.get_lead",
    "crm.create_lead",
    "crm.list_opportunities",
    "context.search",
    "document.get_pdf",
    "lead_qualification.qualify",
    "lead_qualification.disqualify",
    "customer.list",
    "customer.get",
    "opportunity.list",
    "opportunity.get",
    "opportunity.create",
    "contact.list",
    "contact.get",
    "contact.create",
    "territory.list",
    "territory.get",
    "analytics.aggregate",
    "analytics.percentage",
    "analytics.calculate",
    "analytics.correlate",
  ],
};

export class StaticRolePolicyProvider implements RolePolicyProvider {
  resolveAllowedTools(erpnextRoles: string[]): string[] {
    const set = new Set<string>();
    for (const role of erpnextRoles) {
      const tools = ROLE_TOOL_MAP[role];
      if (!tools) continue;
      if (tools.includes("*")) return ["*"];
      tools.forEach((t) => set.add(t));
    }
    return Array.from(set);
  }
}
