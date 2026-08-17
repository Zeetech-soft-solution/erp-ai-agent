import { crmModule } from "../index";

jest.mock("../../../config/system.config", () => ({
  systemConnector: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

const { systemConnector } = require("../../../config/system.config");

describe("crmModule", () => {
  it("registers the real CRM tool surface (not an empty stub)", () => {
    expect(crmModule.tools.map((t) => t.name)).toEqual([
      "crm.list_leads",
      "crm.get_lead",
      "crm.create_lead",
      "crm.update_lead_status",
      "crm.list_customers",
      "crm.list_opportunities",
      "crm.create_opportunity",
    ]);
  });

  it("crm.list_leads delegates to systemConnector with the caller's own credential", async () => {
    const session = { credential: { mode: "api_key" } } as any;
    const tool = crmModule.tools.find((t) => t.name === "crm.list_leads")!;
    await tool.handler({ filters: { status: "Open" } }, session);
    expect(systemConnector.list).toHaveBeenCalledWith("lead", session.credential, { filters: { status: "Open" }, limit: undefined, offset: undefined });
  });

  it("crm.create_lead is entityKey/ruleAction-tagged so the business-rule engine can gate it", () => {
    const tool = crmModule.tools.find((t) => t.name === "crm.create_lead")!;
    expect(tool.entityKey).toBe("lead");
    expect(tool.ruleAction).toBe("create");
  });
});
