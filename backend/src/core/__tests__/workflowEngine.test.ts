import { systemConnector } from "../../config/system.config";
import { Session, WorkflowDefinition } from "../types";

jest.mock("../../config/system.config", () => ({
  systemConnector: { get: jest.fn(), update: jest.fn() },
}));

// workflowEngine is a module-level singleton — jest.resetModules() would
// disconnect it from the systemConnector mock captured above (a fresh
// require() after reset pulls in an unrelated mock instance). register()
// on the SAME instance is safe to call repeatedly (Map.set on a workflow's
// own key just overwrites), so each test just re-registers the fixture
// fresh instead of resetting the whole module graph.
import { workflowEngine, WorkflowError } from "../workflowEngine";
function freshEngine() {
  workflowEngine.register(LEAD_QUALIFICATION);
  return workflowEngine;
}

const LEAD_QUALIFICATION: WorkflowDefinition = {
  key: "lead_qualification",
  entityKey: "lead",
  statusField: "status",
  transitions: [
    { action: "qualify", from: ["Lead", "Open"], to: "Interested" },
    { action: "disqualify", from: ["Lead", "Open"], to: "Do Not Contact" },
    { action: "convert", from: ["Interested"], to: "Converted", allowedRoles: ["Sales Manager"] },
  ],
};

function sessionWithRoles(roles: string[]): Session {
  return { sub: "u@x.com", erpnext_roles: roles, allowed_tools: ["*"], credential: {} as any };
}

describe("workflowEngine", () => {
  beforeEach(() => jest.clearAllMocks());

  it("transition() applies the entity's own current status to find a valid transition and updates the status field", async () => {
    const engine = freshEngine();
    (systemConnector.get as jest.Mock).mockResolvedValue({ id: "CRM-LEAD-1", status: "Lead" });
    (systemConnector.update as jest.Mock).mockResolvedValue({ id: "CRM-LEAD-1", status: "Interested" });

    const session = sessionWithRoles(["Sales User"]);
    const result = await engine.transition(session, "lead_qualification", "CRM-LEAD-1", "qualify");

    expect(systemConnector.get).toHaveBeenCalledWith("lead", session.credential, "CRM-LEAD-1");
    expect(systemConnector.update).toHaveBeenCalledWith("lead", session.credential, "CRM-LEAD-1", { status: "Interested" });
    expect(result).toEqual({ id: "CRM-LEAD-1", status: "Interested" });
  });

  it("throws WorkflowError for an unregistered workflow key", async () => {
    const engine = freshEngine();
    await expect(engine.transition(sessionWithRoles(["Sales User"]), "no_such_workflow", "X", "qualify")).rejects.toThrow(WorkflowError);
  });

  it("throws WorkflowError when the action isn't valid from the entity's current status", async () => {
    const engine = freshEngine();
    (systemConnector.get as jest.Mock).mockResolvedValue({ id: "CRM-LEAD-1", status: "Converted" });
    await expect(
      engine.transition(sessionWithRoles(["Sales User"]), "lead_qualification", "CRM-LEAD-1", "qualify")
    ).rejects.toThrow(/not valid from status "Converted"/);
    expect(systemConnector.update).not.toHaveBeenCalled();
  });

  it("enforces allowedRoles — denies a transition when the acting user lacks every required role", async () => {
    const engine = freshEngine();
    (systemConnector.get as jest.Mock).mockResolvedValue({ id: "CRM-LEAD-1", status: "Interested" });
    await expect(
      engine.transition(sessionWithRoles(["Sales User"]), "lead_qualification", "CRM-LEAD-1", "convert")
    ).rejects.toThrow(/Role required for "convert": Sales Manager/);
    expect(systemConnector.update).not.toHaveBeenCalled();
  });

  it("allows the transition once the acting user carries a required role", async () => {
    const engine = freshEngine();
    (systemConnector.get as jest.Mock).mockResolvedValue({ id: "CRM-LEAD-1", status: "Interested" });
    (systemConnector.update as jest.Mock).mockResolvedValue({ id: "CRM-LEAD-1", status: "Converted" });
    await engine.transition(sessionWithRoles(["Sales Manager"]), "lead_qualification", "CRM-LEAD-1", "convert");
    expect(systemConnector.update).toHaveBeenCalledWith("lead", expect.anything(), "CRM-LEAD-1", { status: "Converted" });
  });

  it("a transition with no allowedRoles is open to any role that can reach it at all", async () => {
    const engine = freshEngine();
    (systemConnector.get as jest.Mock).mockResolvedValue({ id: "CRM-LEAD-1", status: "Open" });
    (systemConnector.update as jest.Mock).mockResolvedValue({ id: "CRM-LEAD-1", status: "Do Not Contact" });
    await engine.transition(sessionWithRoles(["Employee"]), "lead_qualification", "CRM-LEAD-1", "disqualify");
    expect(systemConnector.update).toHaveBeenCalled();
  });

  it("availableActions() returns only the transitions reachable from the entity's current status", async () => {
    const engine = freshEngine();
    (systemConnector.get as jest.Mock).mockResolvedValue({ id: "CRM-LEAD-1", status: "Lead" });
    const actions = await engine.availableActions(sessionWithRoles(["Sales User"]), "lead_qualification", "CRM-LEAD-1");
    expect(actions.map((a: any) => a.action).sort()).toEqual(["disqualify", "qualify"]);
  });

  it("availableActions() returns an empty array for an unregistered workflow rather than throwing", async () => {
    const engine = freshEngine();
    const actions = await engine.availableActions(sessionWithRoles(["Sales User"]), "no_such_workflow", "X");
    expect(actions).toEqual([]);
  });
});
