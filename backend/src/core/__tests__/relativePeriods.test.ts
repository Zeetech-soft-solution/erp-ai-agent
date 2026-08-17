import { resolveRelativePeriod, detectRelativePeriodPhrase, RELATIVE_PERIODS } from "../relativePeriods";

describe("relativePeriods", () => {
  it("lists the fixed vocabulary", () => {
    expect(RELATIVE_PERIODS).toContain("last_week");
  });

  it("resolveRelativePeriod resolves a real two-sided range", () => {
    // 2026-08-15 is a Saturday; last_week (Mon-Sun) = Aug 3-9.
    expect(resolveRelativePeriod("last_week", "2026-08-15")).toEqual(["2026-08-03", "2026-08-09"]);
  });

  it("resolveRelativePeriod throws on an unknown period", () => {
    expect(() => resolveRelativePeriod("not_a_real_period", "2026-08-15")).toThrow();
  });

  it("detectRelativePeriodPhrase recognizes a real phrase", () => {
    expect(detectRelativePeriodPhrase("last week")).toBe("last_week");
  });
});
