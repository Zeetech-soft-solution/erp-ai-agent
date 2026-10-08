import { runPythonAnalysis } from "../../../core/pythonAnalysis";
import { trendsModule } from "..";
import { systemConnector } from "../../../config/system.config";
import * as python from "../../../core/pythonAnalysis";
import { StaticRolePolicyProvider } from "../../../config/roles.policy";

// The runner is exercised with Node standing in for Python, so the suite
// needs no Python install; the analysis itself is plain pandas.
const node = process.execPath;

describe("runPythonAnalysis", () => {
  it("sends rows on stdin and parses the JSON result", async () => {
    const echo = "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify({count:JSON.parse(s).rows.length})))";
    await expect(runPythonAnalysis("monthly_trend", [{ a: 1 }, { a: 2 }], { command: node, args: ["-e", echo] })).resolves.toEqual({ count: 2 });
  });

  it("reports the script's error output on failure", async () => {
    await expect(
      runPythonAnalysis("monthly_trend", [], { command: node, args: ["-e", "console.error('boom');process.exit(2)"] })
    ).rejects.toThrow(/boom/);
  });

  it("rejects names that are not a plain analysis name", async () => {
    await expect(runPythonAnalysis("../etc/x", [])).rejects.toThrow(/Invalid analysis name/);
  });
});

describe("analytics.monthly_trend", () => {
  const tool = trendsModule.tools[0];
  const session: any = { credential: { mode: "api_key" } };

  afterEach(() => jest.restoreAllMocks());

  it("fetches as the user, sends only date and total to the analysis, and returns its summary", async () => {
    const list = jest.spyOn(systemConnector, "list").mockResolvedValue([{ date: "2026-01-05", total: 100, customer: "A" }]);
    const run = jest.spyOn(python, "runPythonAnalysis").mockResolvedValue({ kpis: [{ label: "Total", value: 100 }] });

    const result = await tool.handler({ entity: "sales_invoice", from_date: "2026-01-01", to_date: "2026-03-31" }, session);

    expect(list).toHaveBeenCalledWith("sales_invoice", session.credential, expect.objectContaining({
      filters: { date: ["between", ["2026-01-01", "2026-03-31"]], status: ["not in", ["Draft", "Cancelled"]] },
    }));
    expect(run).toHaveBeenCalledWith("monthly_trend", [{ date: "2026-01-05", total: 100 }]);
    expect(result).toMatchObject({ entity: "sales_invoice", records_analysed: 1, kpis: [{ label: "Total", value: 100 }] });
  });

  it("refuses entities outside the analysis data contract", async () => {
    await expect(tool.handler({ entity: "employee", from_date: "2026-01-01", to_date: "2026-01-31" }, session)).rejects.toThrow(/entity must be one of/);
  });

  it("is granted to every role", () => {
    expect(new StaticRolePolicyProvider().resolveAllowedTools(["Employee"])).toContain("analytics.monthly_trend");
  });
});
