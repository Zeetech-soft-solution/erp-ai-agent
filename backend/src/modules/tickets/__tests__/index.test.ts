import { ticketsModule } from "../index";
import { systemConnector } from "../../../config/system.config";
import { workflowActionStore } from "../../../core/workflowActionStore";
import { Session } from "../../../core/types";

// 2026-08-23: tickets switched from the simulated businessEmailStore-only
// stub to the REAL ERPNext "issue" entity (systemConnector.list/update) —
// see index.ts's own doc comment for why tickets.resolve stays a hybrid
// (real status update, but resolutionNote still goes through
// workflowActionStore since Issue has no real free-text resolution field).
jest.mock("../../../config/system.config", () => ({
  systemConnector: { list: jest.fn(), update: jest.fn() },
}));
jest.mock("../../../core/workflowActionStore", () => ({ workflowActionStore: { push: jest.fn() } }));

const credential = { mode: "session", sid: "s" };
const session = { sub: "support.rep@sunriseelectronics.example.in", credential } as unknown as Session;

function tool(name: string) {
  const t = ticketsModule.tools.find((t) => t.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
}

describe("ticketsModule", () => {
  beforeEach(() => jest.clearAllMocks());

  it("registers tickets.list and tickets.resolve", () => {
    expect(ticketsModule.tools.map((t) => t.name).sort()).toEqual(["tickets.list", "tickets.resolve"]);
  });

  it("tickets.list queries the real ERPNext issue entity under the caller's own credential", async () => {
    (systemConnector.list as jest.Mock).mockResolvedValue([{ id: "ISS-0001", subject: "Broken login", status: "Open" }]);
    const result: any = await tool("tickets.list").handler({ status: "Open" }, session);
    expect(systemConnector.list).toHaveBeenCalledWith("issue", credential, { filters: { status: "Open" } });
    expect(result).toEqual([{ id: "ISS-0001", subject: "Broken login", status: "Open" }]);
  });

  it("tickets.list omits filters the user didn't ask for", async () => {
    (systemConnector.list as jest.Mock).mockResolvedValue([]);
    await tool("tickets.list").handler({}, session);
    expect(systemConnector.list).toHaveBeenCalledWith("issue", credential, { filters: {} });
  });

  it("tickets.resolve sets the real ERPNext status to Resolved AND durably logs the resolution note", async () => {
    (systemConnector.update as jest.Mock).mockResolvedValue({ id: "ISS-0001", status: "Resolved" });
    (workflowActionStore.push as jest.Mock).mockResolvedValue({ id: "resolve-1" });
    const args = { ticketId: "ISS-0001", resolutionNote: "Reset the user's password" };
    const result: any = await tool("tickets.resolve").handler(args, session);
    expect(systemConnector.update).toHaveBeenCalledWith("issue", credential, "ISS-0001", { status: "Resolved" });
    expect(workflowActionStore.push).toHaveBeenCalledWith(session.sub, {
      module: "tickets",
      recordKey: "ISS-0001",
      action: "resolve",
      detail: "Reset the user's password",
    });
    expect(result).toEqual({ ok: true, issue: { id: "ISS-0001", status: "Resolved" }, resolved: { id: "resolve-1" } });
  });

  it("tickets.resolve is gated by real businessRuleEngine enforcement (entityKey/ruleAction present)", () => {
    const t = tool("tickets.resolve");
    expect((t as any).entityKey).toBe("issue");
    expect((t as any).ruleAction).toBe("update");
  });
});
