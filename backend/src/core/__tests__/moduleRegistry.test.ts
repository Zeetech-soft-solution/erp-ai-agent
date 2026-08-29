import { MCPModule } from "../types";

// moduleRegistry is a module-level singleton (`export const moduleRegistry`)
// so it accumulates state across tests in the same file — reset it via a
// fresh require per test rather than sharing one import, so each test
// starts from a genuinely empty registry.
function freshRegistry() {
  jest.resetModules();
  return require("../moduleRegistry").moduleRegistry;
}

function mod(name: string, toolNames: string[]): MCPModule {
  return {
    name,
    description: `${name} module`,
    tools: toolNames.map((n) => ({
      name: n,
      description: n,
      module: name,
      parameters: { type: "object", properties: {} },
      handler: async () => ({}),
    })),
  };
}

describe("moduleRegistry", () => {
  it("registers a module and makes its tools discoverable via findTool", () => {
    const registry = freshRegistry();
    registry.register(mod("crm", ["crm.list_leads", "crm.get_lead"]));
    expect(registry.findTool("crm.list_leads")?.name).toBe("crm.list_leads");
    expect(registry.findTool("crm.get_lead")?.name).toBe("crm.get_lead");
  });

  it("getAllTools flattens tools across every registered module", () => {
    const registry = freshRegistry();
    registry.register(mod("crm", ["crm.list_leads"]));
    registry.register(mod("email", ["email.list", "email.send"]));
    expect(registry.getAllTools().map((t: any) => t.name).sort()).toEqual(["crm.list_leads", "email.list", "email.send"]);
  });

  it("getModules returns every registered module", () => {
    const registry = freshRegistry();
    registry.register(mod("crm", ["crm.list_leads"]));
    registry.register(mod("email", ["email.list"]));
    expect(registry.getModules().map((m: MCPModule) => m.name).sort()).toEqual(["crm", "email"]);
  });

  it("findTool returns undefined for a tool that was never registered", () => {
    const registry = freshRegistry();
    registry.register(mod("crm", ["crm.list_leads"]));
    expect(registry.findTool("nonexistent.tool")).toBeUndefined();
  });

  it("throws when the same module name is registered twice", () => {
    const registry = freshRegistry();
    registry.register(mod("crm", ["crm.list_leads"]));
    expect(() => registry.register(mod("crm", ["crm.get_lead"]))).toThrow(/already registered/);
  });

  it("throws when two different modules register a tool with the same name — a real config bug, not something to silently overwrite", () => {
    const registry = freshRegistry();
    registry.register(mod("crm", ["shared.name"]));
    expect(() => registry.register(mod("email", ["shared.name"]))).toThrow(/Duplicate tool name/);
  });
});
