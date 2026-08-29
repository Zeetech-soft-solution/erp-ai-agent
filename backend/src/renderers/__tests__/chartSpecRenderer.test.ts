import { renderSingleChartSpec, renderChartDashboard } from "../chartSpecRenderer";
import { buildChartSpec } from "../../core/chartSpecBuilder";

describe("chartSpecRenderer", () => {
  describe("bar", () => {
    // Confirmed live 2026-08-16: the previous two-element approach (a
    // fixed-color track div with a percentage-width colored child)
    // painted as an empty gray track for a real user, with no colored
    // fill visible — despite every computed style on the fill child
    // checking out correct in the live DOM. Rebuilt as one self-
    // contained element per row with a hard-stop linear-gradient
    // background, so there's no separate child box for a color to fail
    // to show up on; see renderBarChart's own doc comment.
    it("renders one row per label as a single self-contained hard-stop gradient bar (no separate fill child)", () => {
      const spec = buildChartSpec({ type: "bar", title: "Leads", labels: ["Open", "Closed"], series: [{ name: "count", values: [4, 2] }] });
      const html = renderSingleChartSpec(spec);
      expect(html).toContain("linear-gradient(to right, #2F6F5E 0%, #2F6F5E 100%");
      expect(html).toContain("linear-gradient(to right, #2F6F5E 0%, #2F6F5E 50%");
      expect(html).toContain("Open");
      expect(html).toContain("Closed");
      expect(html).toContain("Leads");
    });

    it("shows a legend and per-series label only when there is more than one series", () => {
      const single = renderSingleChartSpec(buildChartSpec({ type: "bar", title: "t", labels: ["a"], series: [{ name: "s", values: [1] }] }));
      expect(single).not.toContain(" — s");

      const multi = renderSingleChartSpec(
        buildChartSpec({
          type: "bar",
          title: "t",
          labels: ["a"],
          series: [
            { name: "Revenue", values: [1] },
            { name: "Cost", values: [2] },
          ],
        })
      );
      expect(multi).toContain("Revenue");
      expect(multi).toContain("Cost");
      expect(multi).toContain("a — Revenue");
    });

    it("escapes HTML in labels/titles", () => {
      const spec = buildChartSpec({ type: "bar", title: "<script>x</script>", labels: ["<b>a</b>"], series: [{ name: "s", values: [1] }] });
      const html = renderSingleChartSpec(spec);
      expect(html).not.toContain("<script>x</script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("line", () => {
    it("renders an inline SVG with one polyline per series", () => {
      const spec = buildChartSpec({
        type: "line",
        title: "Trend",
        labels: ["Jan", "Feb", "Mar"],
        series: [
          { name: "A", values: [1, 2, 3] },
          { name: "B", values: [3, 2, 1] },
        ],
      });
      const html = renderSingleChartSpec(spec);
      expect(html).toContain("<svg");
      expect((html.match(/<polyline/g) || []).length).toBe(2);
    });

    // Confirmed live 2026-08-16: inside a multi-chart dashboard grid this
    // SVG can render at roughly half its native viewBox size — plain
    // stroke-width scales down with it, and a real user reported the
    // line's color as "missing"/"faded" even though the color value
    // itself was always correct (confirmed via getComputedStyle). Locks
    // in the fix: vector-effect="non-scaling-stroke" keeps the stroke a
    // constant screen width regardless of how much the chart is scaled.
    it("keeps the line's stroke width constant regardless of scale (vector-effect)", () => {
      const spec = buildChartSpec({ type: "line", title: "t", labels: ["a", "b"], series: [{ name: "s", values: [1, 2] }] });
      const html = renderSingleChartSpec(spec);
      expect(html).toContain('vector-effect="non-scaling-stroke"');
    });
  });

  describe("pie/donut", () => {
    // SVG wedges rather than a CSS conic-gradient — deliberately switched
    // 2026-08-16 for reliable html2canvas rasterization in the PDF export
    // (see chartSpecRenderer.ts's own doc comment on renderPieChart).
    it("renders one SVG wedge per slice, using each slice's real color", () => {
      const spec = buildChartSpec({ type: "pie", title: "t", labels: ["A", "B"], series: [{ name: "s", values: [1, 1] }] });
      const html = renderSingleChartSpec(spec);
      expect(html).toContain("<svg");
      expect((html.match(/<path /g) || []).length).toBe(2);
      for (const slice of spec.slices!) {
        expect(html).toContain(slice.color);
      }
    });

    it("draws a single 100%-share slice as a full circle (degenerate arc case)", () => {
      const spec = buildChartSpec({ type: "pie", title: "t", labels: ["Only"], series: [{ name: "s", values: [42] }] });
      const html = renderSingleChartSpec(spec);
      expect(html).toContain("<circle");
      expect(html).not.toContain("<path");
    });

    it("donut adds a center hole circle that pie does not", () => {
      const pieSpec = buildChartSpec({ type: "pie", title: "t", labels: ["A", "B"], series: [{ name: "s", values: [1, 1] }] });
      const donutSpec = buildChartSpec({ type: "donut", title: "t", labels: ["A", "B"], series: [{ name: "s", values: [1, 1] }] });
      const pieCircleCount = (renderSingleChartSpec(pieSpec).match(/<circle/g) || []).length;
      const donutCircleCount = (renderSingleChartSpec(donutSpec).match(/<circle/g) || []).length;
      expect(donutCircleCount).toBe(pieCircleCount + 1);
    });

    it("legend shows each slice's label, value, and computed percentage", () => {
      const spec = buildChartSpec({ type: "pie", title: "t", labels: ["North", "South"], series: [{ name: "s", values: [25, 75] }] });
      const html = renderSingleChartSpec(spec);
      expect(html).toContain("North");
      expect(html).toContain("South");
      expect(html).toContain("25%");
      expect(html).toContain("75%");
    });
  });

  describe("renderChartDashboard (multi-chart composition)", () => {
    it("renders a single chart with no grid wrapper", () => {
      const spec = buildChartSpec({ type: "bar", title: "t", labels: ["a"], series: [{ name: "s", values: [1] }] });
      const html = renderChartDashboard([spec], { render: "chart" });
      expect(html).not.toContain("grid-template-columns");
      expect(html).toContain("erp-agent-report");
    });

    it("wraps multiple charts in a responsive grid, in call order", () => {
      const spec1 = buildChartSpec({ type: "bar", title: "First", labels: ["a"], series: [{ name: "s", values: [1] }] });
      const spec2 = buildChartSpec({ type: "pie", title: "Second", labels: ["x", "y"], series: [{ name: "s", values: [1, 1] }] });
      const html = renderChartDashboard([spec1, spec2], { render: "chart" });
      expect(html).toContain("grid-template-columns");
      expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
    });

    it("still renders next_steps buttons when provided", () => {
      const spec = buildChartSpec({ type: "bar", title: "t", labels: ["a"], series: [{ name: "s", values: [1] }] });
      const html = renderChartDashboard([spec], { render: "chart", next_steps: ["Do the thing"] });
      expect(html).toContain("Do the thing");
      expect(html).toContain("erp-agent-next-step");
    });

    it("returns a graceful empty state for zero specs rather than throwing", () => {
      expect(renderChartDashboard([], { render: "chart" })).toContain("No chart data");
    });
  });
});
