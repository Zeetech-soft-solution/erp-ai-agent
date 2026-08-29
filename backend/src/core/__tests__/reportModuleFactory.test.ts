import { buildReportModule, normalizeReportArgs } from "../reportModuleFactory";
import { ReportConfig } from "../types";

// Confirmed live 2026-08-11: "profit and loss for this month vs last
// month" called accounting.report.profit_and_loss with the *.list-tool
// filter shape ({"date":{"op":"relative","value":"this_month"}}) and both
// calls silently failed - report filters need literal from_date/to_date
// ISO strings, not {op,value}/"relative". This suite locks in the fix:
// the generated tool description now says so explicitly.
describe("buildReportModule — filter description generation", () => {
  function filtersDescription(config: ReportConfig): string {
    const mod = buildReportModule(config);
    const tool = mod.tools[0];
    const parameters = tool.parameters as any;
    return parameters.properties.filters.description as string;
  }

  it("documents literal ISO dates and forbids the relative/op-wrapper shape", () => {
    const description = filtersDescription({
      reportKey: "profit_and_loss",
      module: "accounting",
      filterFields: ["from_date", "to_date", "cost_center"],
    });
    expect(description).toContain("literal ISO date strings");
    expect(description).not.toContain('"op":"relative"');
    expect(description).toMatch(/NOT the.*op.*value.*shape/);
    expect(description).toContain("from_date, to_date, cost_center");
  });

  it("omits the filterFields list when none is configured, without breaking the rest of the description", () => {
    const description = filtersDescription({ reportKey: "stock_balance", module: "stock" });
    expect(description).toContain("literal ISO date strings");
    expect(description).not.toContain("Accepted canonical filter keys");
  });
});

// Confirmed live 2026-08-12: "profit and loss for this month vs last
// month" intermittently failed with ERPNext's real "From Date and To
// Date are mandatory" error — traced to the model sometimes calling
// this tool with from_date/to_date as TOP-LEVEL arguments instead of
// properly nested under "filters" (the same malformed-call shape
// normalizeListArgs already recovers for *.list tools). This suite
// locks in the equivalent recovery for report tools.
describe("normalizeReportArgs", () => {
  const filterFields = ["from_date", "to_date", "cost_center"];

  it("recovers top-level filter-shaped keys into a filters object", () => {
    expect(normalizeReportArgs({ from_date: "2026-08-01", to_date: "2026-08-31" }, filterFields)).toEqual({
      from_date: "2026-08-01",
      to_date: "2026-08-31",
    });
  });

  it("passes a properly-shaped filters object through untouched", () => {
    const result = normalizeReportArgs({ filters: { from_date: "2026-07-01", to_date: "2026-07-31" } }, filterFields);
    expect(result).toEqual({ from_date: "2026-07-01", to_date: "2026-07-31" });
  });

  it("prefers real filters values over a stray top-level key on collision", () => {
    const result = normalizeReportArgs(
      { from_date: "2026-08-01", filters: { from_date: "2026-08-05", to_date: "2026-08-31" } },
      filterFields
    );
    expect(result).toEqual({ from_date: "2026-08-05", to_date: "2026-08-31" });
  });

  it("ignores unrecognized top-level keys instead of leaking them into filters", () => {
    const result = normalizeReportArgs({ made_up_thing: "x" }, filterFields);
    expect(result).toBeUndefined();
  });

  it("returns args.filters unchanged when the report declares no filterFields", () => {
    expect(normalizeReportArgs({ from_date: "2026-08-01" }, undefined)).toBeUndefined();
    expect(normalizeReportArgs({ filters: { anything: 1 } }, undefined)).toEqual({ anything: 1 });
  });

  it("handles undefined args without throwing", () => {
    expect(normalizeReportArgs(undefined, filterFields)).toBeUndefined();
  });
});
