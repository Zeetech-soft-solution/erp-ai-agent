import { buildWorkflowModule, buildWorkflowModules } from "../workflowToolFactory";
import { workflowEngine, WorkflowError } from "../workflowEngine";
import { Session, WorkflowDefinition } from "../types";

jest.mock("../workflowEngine", () => {
  const actual = jest.requireActual("../workflowEngine");
  return { ...actual, workflowEngine: { transition: jest.fn() } };
});

const LEAD_QUALIFICATION: WorkflowDefinition = {
  key: "lead_qualification",
  entityKey: "lead",
  statusField: "status",
  description: "Qualify or disqualify a lead",
  transitions: [
    { action: "qualify", from: ["Lead", "Open"], to: "Interested" },
    { action: "disqualify", from: ["Lead", "Open"], to: "Do Not Contact", description: "Mark a lead as not worth pursuing" },
  ],
};

const session = { sub: "u@x.com", erpnext_roles: ["Sales User"], allowed_tools: ["*"], credential: {} as any } as Session;

describe("workflowToolFactory", () => {
  beforeEach(() => jest.clearAllMocks());

  it("buildWorkflowModule generates one tool per transition, named <workflowKey>.<action>", () => {
    const mod = buildWorkflowModule(LEAD_QUALIFICATION);
    expect(mod.name).toBe("lead_qualification");
    expect(mod.tools.map((t) => t.name).sort()).toEqual(["lead_qualification.disqualify", "lead_qualification.qualify"]);
  });

  it("uses the transition's own description when given, else falls back to a generated one", () => {
    const mod = buildWorkflowModule(LEAD_QUALIFICATION);
    const disqualify = mod.tools.find((t) => t.name === "lead_qualification.disqualify")!;
    expect(disqualify.description).toBe("Mark a lead as not worth pursuing");
    const qualify = mod.tools.find((t) => t.name === "lead_qualification.qualify")!;
    expect(qualify.description).toBe('Move a lead from Lead/Open to Interested via "qualify"');
  });

  it("a tool's handler calls workflowEngine.transition with the workflow key, entity_id, and this specific action", async () => {
    const mod = buildWorkflowModule(LEAD_QUALIFICATION);
    const qualify = mod.tools.find((t) => t.name === "lead_qualification.qualify")!;
    (workflowEngine.transition as jest.Mock).mockResolvedValue({ id: "CRM-LEAD-1", status: "Interested" });

    const result = await qualify.handler({ entity_id: "CRM-LEAD-1" }, session);

    expect(workflowEngine.transition).toHaveBeenCalledWith(session, "lead_qualification", "CRM-LEAD-1", "qualify");
    expect(result).toEqual({ id: "CRM-LEAD-1", status: "Interested" });
  });

  it("converts a WorkflowError into a plain {error} result instead of throwing through to the reasoning loop", async () => {
    const mod = buildWorkflowModule(LEAD_QUALIFICATION);
    const qualify = mod.tools.find((t) => t.name === "lead_qualification.qualify")!;
    (workflowEngine.transition as jest.Mock).mockRejectedValue(new WorkflowError('Action "qualify" is not valid from status "Converted"'));

    const result = await qualify.handler({ entity_id: "CRM-LEAD-1" }, session);
    expect(result).toEqual({ error: 'Action "qualify" is not valid from status "Converted"' });
  });

  it("re-throws a non-WorkflowError (a genuine unexpected failure) rather than masking it as a normal tool result", async () => {
    const mod = buildWorkflowModule(LEAD_QUALIFICATION);
    const qualify = mod.tools.find((t) => t.name === "lead_qualification.qualify")!;
    (workflowEngine.transition as jest.Mock).mockRejectedValue(new Error("ERPNext connection reset"));

    await expect(qualify.handler({ entity_id: "CRM-LEAD-1" }, session)).rejects.toThrow("ERPNext connection reset");
  });

  it("buildWorkflowModules builds one MCPModule per workflow definition", () => {
    const other: WorkflowDefinition = { ...LEAD_QUALIFICATION, key: "opportunity_stage" };
    const modules = buildWorkflowModules([LEAD_QUALIFICATION, other]);
    expect(modules.map((m) => m.name).sort()).toEqual(["lead_qualification", "opportunity_stage"]);
  });
});
