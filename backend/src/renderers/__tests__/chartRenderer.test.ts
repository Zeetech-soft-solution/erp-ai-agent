import "../chartRenderer";
import "../tableRenderer"; // chartRenderer falls back to "table" when nothing is groupable
import { rendererRegistry } from "../../core/rendererRegistry";
import { DisplayIntent } from "../../core/types";

// Confirmed live 2026-08-13: "give me graph of todays lead" against a real
// 3-row crm.list_leads result rendered a plain table, not a chart — the
// "chart" render kind was declared in DisplayIntent's type but never had a
// registered renderer at all (silently fell back to "raw"/"table" either
// way) and was never even mentioned to the model as an option. This suite
// locks in the actual fix: a generic "count by category" bar chart that
// works off the same array-of-objects shape every other renderer uses.
describe("chart renderer — count-by-category bar chart", () => {
  const intent: DisplayIntent = { render: "chart" };

  const leads = [
    { id: "CRM-LEAD-1", display_name: "Shabeeb", status: "Lead" },
    { id: "CRM-LEAD-2", display_name: "Nishana pk", status: "Lead" },
    { id: "CRM-LEAD-3", display_name: "Shabeeb", status: "Interested" },
  ];

  it("groups by a status-like field and counts records per bucket", () => {
    const html = rendererRegistry.render("chart", leads, intent);
    expect(html).toContain('class="erp-agent-chart"');
    expect(html).toContain('class="erp-agent-chart-label">Lead<');
    expect(html).toContain('class="erp-agent-chart-value">2<');
    expect(html).toContain('class="erp-agent-chart-label">Interested<');
    expect(html).toContain('class="erp-agent-chart-value">1<');
  });

  it("prefers a real 'status' column over a same-cardinality alternative", () => {
    // display_name also has exactly 2 distinct values here (Shabeeb x2,
    // Nishana pk x1) — status must still win per PREFERRED_GROUP_FIELDS.
    const html = rendererRegistry.render("chart", leads, intent);
    expect(html).not.toContain('class="erp-agent-chart-label">Shabeeb<');
  });

  it("falls back to a table when no column is a usable category (e.g. every value is unique)", () => {
    const uniqueRows = [
      { id: "A", email: "a@x.com" },
      { id: "B", email: "b@x.com" },
    ];
    const html = rendererRegistry.render("chart", uniqueRows, intent);
    expect(html).toContain("<table");
    expect(html).not.toContain('class="erp-agent-chart"');
  });

  it("falls back to a table for a single-record result (nothing to group)", () => {
    const html = rendererRegistry.render("chart", { id: "A", status: "Open" }, intent);
    expect(html).toContain("<table");
  });

  it("ignores a column with only one distinct value (every bar would be identical)", () => {
    const sameStatus = [
      { id: "A", status: "Open", source: "Web" },
      { id: "B", status: "Open", source: "Referral" },
      { id: "C", status: "Open", source: "Web" },
    ];
    const html = rendererRegistry.render("chart", sameStatus, intent);
    // status has 1 distinct value (unusable) — falls through to "source" instead.
    expect(html).toContain('class="erp-agent-chart-label">Web<');
    expect(html).toContain('class="erp-agent-chart-label">Referral<');
  });

  it("guards against a nested object cell the same way table/cards renderers do", () => {
    const rows = [
      { id: "A", status: "Open", contact: { name: "Acme" } },
      { id: "B", status: "Closed", contact: { name: "Beta" } },
    ];
    const html = rendererRegistry.render("chart", rows, intent);
    expect(html).not.toContain("[object Object]");
  });

  it("still renders next_steps below the chart", () => {
    const html = rendererRegistry.render("chart", leads, { render: "chart", next_steps: ["Export leads"] });
    expect(html).toContain('data-action="Export leads"');
  });

  it("returns an empty-state message for no data", () => {
    const html = rendererRegistry.render("chart", [], intent);
    expect(html).toContain("erp-agent-empty");
  });
});
