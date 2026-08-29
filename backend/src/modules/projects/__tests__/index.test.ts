import { projectsModule } from "../index";
import { workflowActionStore } from "../../../core/workflowActionStore";
import { Session } from "../../../core/types";

jest.mock("../../../core/workflowActionStore", () => ({ workflowActionStore: { push: jest.fn() } }));

const session = { sub: "radha.mishra59@sunriseelectronics.example.in" } as unknown as Session;

function tool(name: string) {
  const t = projectsModule.tools.find((t) => t.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
}

describe("projectsModule (external project_issue MCP stub, distinct from the real ERPNext project entity module)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("registers project_issue.list and project_issue.comment under the project_issue module name", () => {
    expect(projectsModule.name).toBe("project_issue");
    expect(projectsModule.tools.map((t) => t.name).sort()).toEqual(["project_issue.comment", "project_issue.list"]);
  });

  it("project_issue.list is still an unwired stub — never claims real issue data", async () => {
    const result: any = await tool("project_issue.list").handler({ status: "open" }, session);
    expect(result.note).toMatch(/not yet connected/i);
  });

  it("project_issue.comment durably records the comment via workflowActionStore under the caller's own identity", async () => {
    (workflowActionStore.push as jest.Mock).mockResolvedValue({ id: "action-1" });
    const args = { issueKey: "ERP-101", comment: "Fixed in latest deploy" };
    const result: any = await tool("project_issue.comment").handler(args, session);
    expect(workflowActionStore.push).toHaveBeenCalledWith(session.sub, {
      module: "project_issue",
      recordKey: "ERP-101",
      action: "comment",
      detail: "Fixed in latest deploy",
    });
    expect(result).toEqual({ ok: true, posted: { id: "action-1" } });
  });
});
