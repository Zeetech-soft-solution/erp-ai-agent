jest.mock("../../../config/system.config", () => ({
  systemConnector: { aggregate: jest.fn().mockResolvedValue({ overall: { value: 0, count: 0 }, groups: [] }) },
}));

import { validatePercentageCounts, reconcilePercentageFilters, analyticsModule } from "../index";
import { systemConnector } from "../../../config/system.config";

const aggregateTool = analyticsModule.tools.find((t) => t.name === "analytics.aggregate")!;
const runAggregate = (args: any) => aggregateTool.handler(args, { credential: {} } as any);

// Confirmed live 2026-08-15: "show me a bar chart of leads broken down by
// status" made the model correctly guess entityKey:"lead" against
// analytics.aggregate several times, in every argument shape — every one
// was rejected as "Unknown entity", even though crm.list_leads already
// proves the connector-level "lead" path works fine (see index.ts's own
// doc comment on VALID_ENTITY_KEYS for the full root cause: "lead" is
// hand-written in modules/crm/index.ts, not registered in ENTITY_CONFIGS).
describe("analytics.aggregate entityKey validation", () => {
  it('accepts entityKey:"lead" (the confirmed-live gap) without throwing "Unknown entity"', async () => {
    await expect(runAggregate({ entityKey: "lead", op: "count", groupBy: "status" })).resolves.toBeDefined();
    expect(systemConnector.aggregate).toHaveBeenCalledWith("lead", {}, expect.objectContaining({ op: "count", groupBy: "status" }));
  });

  it("still rejects a genuinely unknown entity", async () => {
    await expect(runAggregate({ entityKey: "not_a_real_entity", op: "count" })).rejects.toThrow(/Unknown entity/);
  });
});

// Real, live-found gap (2026-08-26, confirmed via real interaction_log
// traffic on the sibling groupByPeriod path) — a metric's own "name" is
// genuinely optional in the schema here too; this plain groupBy+metrics
// path had the identical fallback gap.
describe("analytics.aggregate groupBy + metrics — fallback naming when a metric omits its own name", () => {
  it("falls back to a real op_field name instead of a literal undefined key", async () => {
    (systemConnector.aggregate as jest.Mock).mockResolvedValueOnce({ groups: [{ key: "Acme", value: 500 }] });

    const result: any = await runAggregate({
      entityKey: "sales_invoice",
      groupBy: "customer",
      metrics: [{ op: "sum", field: "total" }], // no "name" at all
    });

    expect(result.groups).toEqual([{ key: "Acme", sum_total: 500 }]);
  });
});

const calculateTool = analyticsModule.tools.find((t) => t.name === "analytics.calculate")!;
const runCalculate = (args: any) => calculateTool.handler(args, {} as any);

const correlateTool = analyticsModule.tools.find((t) => t.name === "analytics.correlate")!;
const runCorrelate = (args: any) => correlateTool.handler(args, {} as any);

// Confirmed live 2026-08-11: "compare this month's pass rate to last
// month's" called analytics.percentage with a date filter missing from
// one side of the numerator/denominator pair, producing matched=1227 >
// total=66 - a mathematically impossible 1859.1% surfaced to the user
// as if it were real. This suite locks in the guardrail: an impossible
// result throws instead of silently propagating.
describe("validatePercentageCounts", () => {
  it("throws when matched exceeds total (the exact live failure)", () => {
    expect(() => validatePercentageCounts(1227, 66)).toThrow(/impossible result/);
  });

  it("throws with actionable guidance naming filters/ofFilters", () => {
    expect(() => validatePercentageCounts(5, 3)).toThrow(/filters.*ofFilters/s);
  });

  it("does not throw when matched equals total (100%)", () => {
    expect(() => validatePercentageCounts(10, 10)).not.toThrow();
  });

  it("does not throw when matched is a proper subset of total", () => {
    expect(() => validatePercentageCounts(21, 1290)).not.toThrow();
  });

  it("does not throw when total is zero (no base population — percentage is null, not impossible)", () => {
    expect(() => validatePercentageCounts(0, 0)).not.toThrow();
  });
});

// Confirmed live 2026-08-17: "compare quality inspection pass rate this
// month against last month" burned its ENTIRE tool-iteration budget on
// validatePercentageCounts' error and never recovered - every retry sent
// filters:{"status":"Accepted"} with the period condition ONLY in
// ofFilters, got matched=1242 (real all-time count) vs total=36 (correctly
// month-scoped), and the model never added the date condition to filters
// despite the error message saying exactly that. reconcilePercentageFilters
// closes this deterministically instead of hoping the model self-corrects.
describe("reconcilePercentageFilters", () => {
  it("merges a scoping key present in ofFilters but missing from filters (the exact live failure shape)", () => {
    const result = reconcilePercentageFilters({ status: "Accepted" }, { date: { op: "relative", value: "this_month" } });
    expect(result).toEqual({ status: "Accepted", date: { op: "relative", value: "this_month" } });
  });

  it("never overwrites a key the caller genuinely set differently in filters — a real mismatch stays a real mismatch", () => {
    const result = reconcilePercentageFilters({ status: "Accepted" }, { status: "Rejected" });
    expect(result).toEqual({ status: "Accepted" });
  });

  it("returns filters unchanged when ofFilters is omitted", () => {
    expect(reconcilePercentageFilters({ status: "Accepted" }, undefined)).toEqual({ status: "Accepted" });
  });

  it("returns ofFilters' keys as filters when filters itself is omitted", () => {
    expect(reconcilePercentageFilters(undefined, { date: { op: "relative", value: "this_month" } }))
      .toEqual({ date: { op: "relative", value: "this_month" } });
  });

  it("is a no-op when filters already includes every key ofFilters has", () => {
    const filters = { status: "Accepted", date: { op: "relative", value: "this_month" } };
    expect(reconcilePercentageFilters(filters, { date: { op: "relative", value: "this_month" } })).toEqual(filters);
  });
});

describe("analytics.percentage handler", () => {
  const percentageTool = analyticsModule.tools.find((t) => t.name === "analytics.percentage")!;
  const runPercentage = (args: any) => percentageTool.handler(args, { credential: {} } as any);

  beforeEach(() => jest.clearAllMocks());

  it("reconciles filters with ofFilters before computing the numerator — the live failure now resolves instead of erroring", async () => {
    (systemConnector.aggregate as jest.Mock)
      .mockResolvedValueOnce({ overall: { value: 0, count: 9 } }) // matched: reconciled (status=Accepted AND this_month)
      .mockResolvedValueOnce({ overall: { value: 0, count: 36 } }); // total: this_month

    const result: any = await runPercentage({
      entityKey: "quality_inspection",
      filters: { status: "Accepted" },
      ofFilters: { date: { op: "relative", value: "this_month" } },
    });

    expect(systemConnector.aggregate).toHaveBeenNthCalledWith(1, "quality_inspection", {}, {
      op: "count",
      filters: { status: "Accepted", date: { op: "relative", value: "this_month" } },
    });
    expect(result).toEqual({ percentage: 25, matched: 9, total: 36 });
  });

  it("still throws validatePercentageCounts' error for a genuine mismatch reconciliation can't fix", async () => {
    (systemConnector.aggregate as jest.Mock)
      .mockResolvedValueOnce({ overall: { value: 0, count: 50 } }) // matched: Accepted (all-time, filters has its own status)
      .mockResolvedValueOnce({ overall: { value: 0, count: 10 } }); // total: Rejected only — a real disjoint denominator

    await expect(
      runPercentage({ entityKey: "quality_inspection", filters: { status: "Accepted" }, ofFilters: { status: "Rejected" } })
    ).rejects.toThrow(/impossible result/);
  });
});

// Confirmed 2026-08-14: added so the model can compute a derived metric
// (growth, variance, average-of-averages) over numbers it ALREADY has
// from earlier analytics.aggregate calls, without a wasteful extra
// ERPNext fetch or doing the arithmetic itself in prose.
describe("analytics.calculate tool", () => {
  it("computes sum/avg/median/min/max/variance/stddev over values", async () => {
    await expect(runCalculate({ values: [1, 2, 3, 4], op: "sum" })).resolves.toEqual({ op: "sum", count: 4, value: 10 });
    await expect(runCalculate({ values: [1, 2, 3, 4], op: "avg" })).resolves.toEqual({ op: "avg", count: 4, value: 2.5 });
    await expect(runCalculate({ values: [7, 7, 7], op: "variance" })).resolves.toEqual({ op: "variance", count: 3, value: 0 });
  });

  it("computes growth as a real percentage between exactly two values", async () => {
    await expect(runCalculate({ values: [100, 120], op: "growth" })).resolves.toEqual({
      op: "growth",
      from: 100,
      to: 120,
      percentage: 20,
    });
  });

  it("rejects growth with anything other than exactly 2 values", async () => {
    await expect(runCalculate({ values: [1, 2, 3], op: "growth" })).rejects.toThrow(/exactly 2 values/);
    await expect(runCalculate({ values: [1], op: "growth" })).rejects.toThrow(/exactly 2 values/);
  });

  it("rejects an empty values array instead of silently returning NaN/Infinity", async () => {
    await expect(runCalculate({ values: [], op: "sum" })).rejects.toThrow(/empty/);
  });

  it("rejects non-numeric entries instead of silently coercing to NaN", async () => {
    await expect(runCalculate({ values: [1, "not a number", 3], op: "sum" })).rejects.toThrow(/real numbers/);
  });
});

// Confirmed 2026-08-14: added alongside analytics.calculate as one more
// Pattern-A typed tool (LLM supplies two already-fetched, index-paired
// series; server computes the real Pearson coefficient) rather than a
// general code-execution sandbox — see this tool's own description for
// why that tradeoff was made deliberately, not by default.
// Real, live-found gap closed 2026-08-26: "monthly sales invoice totals
// for the last six months" had no reliable way to construct itself
// through the model's own tool calls — RELATIVE_PERIODS has nothing
// between last_month and last_60_days, so the model rambled about
// "adjusting the date range" and never produced 6 real per-month
// numbers. groupByPeriod:"month" computes all N real calendar months
// server-side in ONE call instead.
describe("analytics.aggregate groupByPeriod:\"month\" (real monthly trend, one call)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("makes one real aggregate call per month and merges them into a groups array", async () => {
    (systemConnector.aggregate as jest.Mock)
      .mockResolvedValueOnce({ overall: { value: 100, count: 2 } })
      .mockResolvedValueOnce({ overall: { value: 200, count: 3 } })
      .mockResolvedValueOnce({ overall: { value: 300, count: 1 } });

    const result: any = await runAggregate({
      entityKey: "sales_invoice",
      op: "sum",
      field: "grand_total",
      groupByPeriod: "month",
      periodField: "posting_date",
      periods: 3,
    });

    expect(systemConnector.aggregate).toHaveBeenCalledTimes(3);
    // Every call scopes the SAME real date field with a "between" range
    // — never left for the model to compute the range itself.
    for (const call of (systemConnector.aggregate as jest.Mock).mock.calls) {
      const filters = call[2].filters;
      expect(filters.posting_date).toEqual({ op: "between", value: [expect.any(String), expect.any(String)] });
    }
    expect(result.groups).toHaveLength(3);
    expect(result.groups.map((g: any) => g.value)).toEqual([100, 200, 300]);
    expect(result.overall).toEqual({ value: 600, count: 6 }); // sum op: real grand total across all 3 months
  });

  it("defaults to 6 periods when not given, and computes a real weighted average (not an average of averages) for op:avg", async () => {
    (systemConnector.aggregate as jest.Mock)
      .mockResolvedValueOnce({ overall: { value: 10, count: 1 } }) // avg=10 over 1 row
      .mockResolvedValueOnce({ overall: { value: 20, count: 3 } }) // avg=20 over 3 rows
      .mockResolvedValueOnce({ overall: { value: 0, count: 0 } })
      .mockResolvedValueOnce({ overall: { value: 0, count: 0 } })
      .mockResolvedValueOnce({ overall: { value: 0, count: 0 } })
      .mockResolvedValueOnce({ overall: { value: 0, count: 0 } });

    const result: any = await runAggregate({ entityKey: "sales_invoice", op: "avg", field: "grand_total", groupByPeriod: "month", periodField: "posting_date" });

    expect(systemConnector.aggregate).toHaveBeenCalledTimes(6);
    // Weighted average: (10*1 + 20*3) / (1+3) = 70/4 = 17.5 — NOT the
    // naive (10+20)/2=15 an average-of-averages would wrongly give.
    expect(result.overall).toEqual({ value: 17.5, count: 4 });
  });

  it("builds a categorical-by-month matrix and fills missing categories with zero", async () => {
    (systemConnector.aggregate as jest.Mock)
      .mockResolvedValueOnce({ groups: [{ key: "Open", value: 3 }] })
      .mockResolvedValueOnce({ groups: [{ key: "Submitted", value: 2 }] });

    const result: any = await runAggregate({
      entityKey: "sales_invoice",
      op: "count",
      groupBy: "status",
      groupByPeriod: "month",
      periodField: "posting_date",
      periods: 2,
    });

    expect(systemConnector.aggregate).toHaveBeenCalledTimes(2);
    expect(systemConnector.aggregate).toHaveBeenNthCalledWith(1, "sales_invoice", {}, expect.objectContaining({ op: "count", groupBy: "status" }));
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toEqual({ key: expect.any(String), Open: 3, Submitted: 0 });
    expect(result.groups[1]).toEqual({ key: expect.any(String), Open: 0, Submitted: 2 });
  });

  it("allows only count for a grouped time chart", async () => {
    await expect(
      runAggregate({ entityKey: "sales_invoice", op: "sum", field: "grand_total", groupBy: "status", groupByPeriod: "month", periodField: "posting_date" })
    ).rejects.toThrow(/count only/);
  });

  it("requires periodField when groupByPeriod is \"month\"", async () => {
    await expect(runAggregate({ entityKey: "sales_invoice", op: "count", groupByPeriod: "month" })).rejects.toThrow(/periodField/);
  });

  it("still requires field for a non-count op", async () => {
    await expect(runAggregate({ entityKey: "sales_invoice", op: "sum", groupByPeriod: "month", periodField: "posting_date" })).rejects.toThrow(/field.*required/);
  });

  // Real, live-found gap (2026-08-26, confirmed via real interaction_log
  // traffic): a real "Total Sales per month" call reached for
  // metrics:[{name,op,field}] instead of a top-level op/field (the SAME
  // shape groupBy already accepts) and was rejected with a confusing
  // "field is required for op undefined" — groupByPeriod never checked
  // for metrics at all.
  describe("metrics (named measures) also works with groupByPeriod", () => {
    it("runs each metric once per month and merges them into one row per month", async () => {
      (systemConnector.aggregate as jest.Mock)
        .mockResolvedValueOnce({ overall: { value: 1000, count: 5 } }) // March: Total Sales
        .mockResolvedValueOnce({ overall: { value: 2000, count: 8 } }); // April: Total Sales

      const result: any = await runAggregate({
        entityKey: "sales_invoice",
        groupByPeriod: "month",
        periodField: "posting_date",
        periods: 2,
        metrics: [{ name: "Total Sales", op: "sum", field: "total" }],
      });

      expect(systemConnector.aggregate).toHaveBeenCalledTimes(2);
      expect(result.groups).toHaveLength(2);
      expect(result.groups.map((g: any) => g["Total Sales"])).toEqual([1000, 2000]);
      // No top-level op/field required at all when metrics is used —
      // the old validation ("field is required for op undefined") must
      // not fire here.
    });

    it("merges several metrics into one row per month", async () => {
      (systemConnector.aggregate as jest.Mock)
        .mockResolvedValueOnce({ overall: { value: 5, count: 5 } }) // March: count
        .mockResolvedValueOnce({ overall: { value: 1000, count: 5 } }) // March: sum
        .mockResolvedValueOnce({ overall: { value: 8, count: 8 } }) // April: count
        .mockResolvedValueOnce({ overall: { value: 2000, count: 8 } }); // April: sum

      const result: any = await runAggregate({
        entityKey: "sales_invoice",
        groupByPeriod: "month",
        periodField: "posting_date",
        periods: 2,
        metrics: [
          { name: "invoice_count", op: "count" },
          { name: "total_sales", op: "sum", field: "total" },
        ],
      });

      expect(result.groups).toEqual([
        { key: expect.any(String), invoice_count: 5, total_sales: 1000 },
        { key: expect.any(String), invoice_count: 8, total_sales: 2000 },
      ]);
    });

    it("still rejects a metric missing field for a non-count op", async () => {
      await expect(
        runAggregate({
          entityKey: "sales_invoice",
          groupByPeriod: "month",
          periodField: "posting_date",
          metrics: [{ name: "bad", op: "sum" }],
        })
      ).rejects.toThrow(/field.*required/);
    });

    // Real, live-found gap (2026-08-26, confirmed via real
    // interaction_log traffic): a metric's own "name" is genuinely
    // optional in the schema - the model sometimes omits it, and
    // without a fallback the merged row got a literal "undefined" key.
    it("falls back to a real op_field name when a metric omits its own name", async () => {
      (systemConnector.aggregate as jest.Mock)
        .mockResolvedValueOnce({ overall: { value: 1000, count: 5 } })
        .mockResolvedValueOnce({ overall: { value: 2000, count: 8 } });

      const result: any = await runAggregate({
        entityKey: "sales_invoice",
        groupByPeriod: "month",
        periodField: "posting_date",
        periods: 2,
        metrics: [{ op: "sum", field: "total" }], // no "name" at all
      });

      expect(result.groups.every((g: any) => "undefined" in g)).toBe(false);
      expect(result.groups.map((g: any) => g.sum_total)).toEqual([1000, 2000]);
    });

    it("de-dupes two unnamed metrics with different fields instead of colliding", async () => {
      (systemConnector.aggregate as jest.Mock)
        .mockResolvedValueOnce({ overall: { value: 5, count: 5 } })
        .mockResolvedValueOnce({ overall: { value: 1000, count: 5 } });

      const result: any = await runAggregate({
        entityKey: "sales_invoice",
        groupByPeriod: "month",
        periodField: "posting_date",
        periods: 1,
        metrics: [{ op: "count" }, { op: "sum", field: "total" }],
      });

      expect(result.groups[0]).toEqual({ key: expect.any(String), count: 5, sum_total: 1000 });
    });
  });
});

describe("analytics.correlate tool", () => {
  it("computes a real correlation coefficient with direction/strength labels", async () => {
    await expect(runCorrelate({ valuesA: [1, 2, 3, 4], valuesB: [10, 20, 30, 40] })).resolves.toEqual({
      coefficient: 1,
      direction: "positive",
      strength: "strong",
      pairCount: 4,
    });
  });

  it("labels a negative relationship correctly", async () => {
    const result = await runCorrelate({ valuesA: [1, 2, 3, 4], valuesB: [40, 30, 20, 10] });
    expect(result.coefficient).toBe(-1);
    expect(result.direction).toBe("negative");
    expect(result.strength).toBe("strong");
  });

  it("rejects mismatched-length series instead of silently truncating", async () => {
    await expect(runCorrelate({ valuesA: [1, 2, 3], valuesB: [1, 2] })).rejects.toThrow(/equal length/);
  });

  it("rejects non-numeric entries", async () => {
    await expect(runCorrelate({ valuesA: [1, "x", 3], valuesB: [1, 2, 3] })).rejects.toThrow(/real numbers/);
  });
});
