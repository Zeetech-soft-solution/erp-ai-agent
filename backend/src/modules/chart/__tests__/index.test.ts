import { chartModule } from "../index";

describe("chartModule", () => {
  it("exposes exactly one tool, chart.build", () => {
    expect(chartModule.name).toBe("chart");
    expect(chartModule.tools.map((t) => t.name)).toEqual(["chart.build"]);
  });

  it("chart.build's handler delegates to the real shaping logic (not a stub)", async () => {
    const tool = chartModule.tools[0];
    const result = await tool.handler(
      { type: "bar", title: "Test", labels: ["a", "b"], series: [{ name: "s", values: [1, 2] }] },
      {} as any
    );
    expect(result.chartType).toBe("bar");
    expect(result.title).toBe("Test");
  });

  it("chart.build's handler surfaces a real validation error, not a silent failure", async () => {
    const tool = chartModule.tools[0];
    await expect(tool.handler({ type: "bar", title: "", labels: [], series: [] }, {} as any)).rejects.toThrow();
  });
});
