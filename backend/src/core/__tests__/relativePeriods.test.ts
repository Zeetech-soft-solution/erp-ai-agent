import { resolveRelativePeriod, detectRelativePeriodPhrase, RELATIVE_PERIODS } from "../relativePeriods";

describe("relativePeriods", () => {
  it("lists the fixed vocabulary", () => {
    expect(RELATIVE_PERIODS).toContain("last_week");
  });

  it("resolveRelativePeriod throws", () => {
    expect(() => resolveRelativePeriod("last_week", "2026-08-15")).toThrow();
  });

  it("detectRelativePeriodPhrase returns null", () => {
    expect(detectRelativePeriodPhrase("last week")).toBeNull();
  });
});
