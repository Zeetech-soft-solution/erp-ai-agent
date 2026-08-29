import { buildChartSpec } from "../chartSpecBuilder";

describe("chartSpecBuilder.buildChartSpec", () => {
  describe("validation shared across all types", () => {
    it("rejects an unknown type", () => {
      expect(() => buildChartSpec({ type: "scatter", title: "x", labels: ["a"], series: [{ name: "s", values: [1] }] })).toThrow(/type/i);
    });

    it("rejects a missing title", () => {
      expect(() => buildChartSpec({ type: "bar", title: "", labels: ["a"], series: [{ name: "s", values: [1] }] })).toThrow(/title/i);
    });

    it("rejects empty labels", () => {
      expect(() => buildChartSpec({ type: "bar", title: "t", labels: [], series: [{ name: "s", values: [] }] })).toThrow(/labels/i);
    });

    it("rejects empty series", () => {
      expect(() => buildChartSpec({ type: "bar", title: "t", labels: ["a"], series: [] })).toThrow(/series/i);
    });

    it("rejects a series with a mismatched value count", () => {
      expect(() => buildChartSpec({ type: "bar", title: "t", labels: ["a", "b"], series: [{ name: "s", values: [1] }] })).toThrow(/labels/i);
    });

    it("rejects a series with a non-numeric value", () => {
      expect(() => buildChartSpec({ type: "bar", title: "t", labels: ["a"], series: [{ name: "s", values: [NaN] }] })).toThrow(/non-numeric/i);
    });

    it("rejects a series with no name", () => {
      expect(() => buildChartSpec({ type: "bar", title: "t", labels: ["a"], series: [{ name: "", values: [1] }] })).toThrow(/name/i);
    });
  });

  describe("bar/line", () => {
    it("builds a valid single-series bar chart, preserving label order", () => {
      const spec = buildChartSpec({
        type: "bar",
        title: "Leads by Status",
        labels: ["Open", "Closed", "Pending"],
        series: [{ name: "count", values: [12, 6, 2] }],
      });
      expect(spec.chartType).toBe("bar");
      expect(spec.labels).toEqual(["Open", "Closed", "Pending"]);
      expect(spec.series).toHaveLength(1);
      expect(spec.series![0].values).toEqual([12, 6, 2]);
      // Lone series keeps the app's own accent, not the categorical palette.
      expect(spec.series![0].color).toBe("#2F6F5E");
      expect(spec.slices).toBeUndefined();
    });

    it("assigns distinct fixed-order categorical colors to multiple series", () => {
      const spec = buildChartSpec({
        type: "line",
        title: "Revenue vs Cost",
        labels: ["Jan", "Feb"],
        series: [
          { name: "Revenue", values: [100, 120] },
          { name: "Cost", values: [80, 90] },
        ],
      });
      expect(spec.series![0].color).toBe("#2a78d6");
      expect(spec.series![1].color).toBe("#eb6834");
      expect(spec.series![0].color).not.toBe(spec.series![1].color);
    });

    it("does not sort or otherwise reorder bar/line labels", () => {
      const spec = buildChartSpec({ type: "bar", title: "t", labels: ["Z", "A", "M"], series: [{ name: "s", values: [1, 99, 5] }] });
      expect(spec.labels).toEqual(["Z", "A", "M"]);
    });
  });

  describe("pie/donut", () => {
    it("computes real percentages of the total, not model-supplied ones", () => {
      const spec = buildChartSpec({
        type: "pie",
        title: "Deals by Region",
        labels: ["North", "South"],
        series: [{ name: "amount", values: [30, 70] }],
      });
      expect(spec.slices).toHaveLength(2);
      const north = spec.slices!.find((s) => s.label === "North")!;
      const south = spec.slices!.find((s) => s.label === "South")!;
      expect(north.percentage).toBe(30);
      expect(south.percentage).toBe(70);
    });

    it("sorts slices largest-first", () => {
      const spec = buildChartSpec({ type: "donut", title: "t", labels: ["small", "big", "mid"], series: [{ name: "s", values: [1, 10, 5] }] });
      expect(spec.slices!.map((s) => s.label)).toEqual(["big", "mid", "small"]);
    });

    it("rejects more than one series", () => {
      expect(() =>
        buildChartSpec({
          type: "pie",
          title: "t",
          labels: ["a", "b"],
          series: [
            { name: "s1", values: [1, 2] },
            { name: "s2", values: [3, 4] },
          ],
        })
      ).toThrow(/exactly one/i);
    });

    it("rejects negative values", () => {
      expect(() => buildChartSpec({ type: "pie", title: "t", labels: ["a", "b"], series: [{ name: "s", values: [-1, 5] }] })).toThrow(/negative/i);
    });

    it("rejects an all-zero series", () => {
      expect(() => buildChartSpec({ type: "pie", title: "t", labels: ["a", "b"], series: [{ name: "s", values: [0, 0] }] })).toThrow(/positive/i);
    });

    it("collapses more than 7 slices into a sorted-last 'Other' bucket, preserving the real total", () => {
      const labels = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
      const values = [50, 40, 30, 20, 10, 5, 4, 3, 2];
      const spec = buildChartSpec({ type: "pie", title: "t", labels, series: [{ name: "s", values }] });
      expect(spec.slices).toHaveLength(7);
      const other = spec.slices!.find((s) => s.label === "Other")!;
      expect(other).toBeDefined();
      // g(4)+h(3)+i(2) = 9, the three smallest, collapsed together.
      expect(other.value).toBe(9);
      expect(spec.slices![spec.slices!.length - 1].label).toBe("Other");
      const totalPercentage = spec.slices!.reduce((sum, s) => sum + s.percentage, 0);
      expect(Math.round(totalPercentage)).toBe(100);
    });

    it("assigns fixed-order categorical colors to slices, and a distinct muted color to Other", () => {
      const labels = Array.from({ length: 9 }, (_, i) => `cat${i}`);
      const values = Array.from({ length: 9 }, (_, i) => 9 - i); // strictly descending, so order is stable
      const spec = buildChartSpec({ type: "pie", title: "t", labels, series: [{ name: "s", values }] });
      expect(spec.slices![0].color).toBe("#2a78d6");
      const other = spec.slices!.find((s) => s.label === "Other")!;
      expect(other.color).toBe("#898781");
      expect(spec.slices!.map((s) => s.color)).not.toContain(undefined);
    });
  });
});
