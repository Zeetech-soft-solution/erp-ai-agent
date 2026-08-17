import { StaticRolePolicyProvider } from "../roles.policy";

describe("StaticRolePolicyProvider", () => {
  const provider = new StaticRolePolicyProvider();

  it("grants the real CRM sample tool surface to Sales User", () => {
    const tools = provider.resolveAllowedTools(["Sales User"]);
    expect(tools).toEqual(
      expect.arrayContaining([
        "crm.list_leads", "crm.get_lead", "crm.create_lead", "crm.list_opportunities",
        "customer.list", "customer.get",
        "opportunity.list", "opportunity.get", "opportunity.create",
        "contact.list", "contact.get", "contact.create",
        "territory.list", "territory.get",
        "lead_qualification.qualify", "lead_qualification.disqualify",
        "analytics.aggregate", "analytics.percentage",
      ])
    );
  });

  // Address is the one entity deliberately held back in this tier — see
  // config/modules/crm/entities.ts (no address entry at all).
  it("never grants an address.* tool", () => {
    const tools = provider.resolveAllowedTools(["Sales User"]);
    expect(tools.some((t) => t.startsWith("address."))).toBe(false);
  });

  // quotation is no longer this tier's exposed surface — CRM replaced it.
  it("never grants a quotation.* tool", () => {
    const tools = provider.resolveAllowedTools(["Sales User"]);
    expect(tools.some((t) => t.startsWith("quotation."))).toBe(false);
  });

  it("grants nothing to a role with no matching entry", () => {
    expect(provider.resolveAllowedTools(["Purchase User"])).toEqual([]);
  });

  it("returns the union of grants across all of a user's real roles", () => {
    const tools = provider.resolveAllowedTools(["Sales User", "Purchase User"]);
    expect(tools).toContain("crm.list_leads");
  });
});
