import { analyticsModule } from "../index";

describe("analyticsModule", () => {
  it("registers under the analytics module name", () => {
    expect(analyticsModule.name).toBe("analytics");
  });

  it("exposes the four real analytics tools", () => {
    expect(analyticsModule.tools.map((t) => t.name)).toEqual([
      "analytics.aggregate",
      "analytics.percentage",
      "analytics.calculate",
      "analytics.correlate",
    ]);
  });
});
