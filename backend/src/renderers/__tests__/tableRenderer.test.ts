import "../tableRenderer";
import { rendererRegistry } from "../../core/rendererRegistry";
import { DisplayIntent } from "../../core/types";

// Confirmed live 2026-08-12: users want a row's own id clickable straight
// into that record's details instead of a separate generic "view details"
// button — this suite locks in the id cell becoming a real clickable
// element (same .erp-agent-next-step click wiring the bottom button row
// already uses) while everything else about the table stays unchanged.
describe("table renderer — clickable row id", () => {
  const intent: DisplayIntent = { render: "table" };

  it("wraps the id column's cell in a .erp-agent-next-step button with a details action", () => {
    const html = rendererRegistry.render("table", [{ id: "SAL-QTN-2026-00014", customer: "Acme" }], intent);
    expect(html).toContain('class="erp-agent-next-step erp-agent-row-id-link"');
    expect(html).toContain('data-action="Show full details of SAL-QTN-2026-00014"');
    expect(html).toContain(">SAL-QTN-2026-00014</button>");
  });

  it("falls back to a 'name' column when there's no 'id' column (raw ERPNext-shaped rows)", () => {
    const html = rendererRegistry.render("table", [{ name: "ACC-PINV-2026-00292", status: "Unpaid" }], intent);
    expect(html).toContain('data-action="Show full details of ACC-PINV-2026-00292"');
  });

  it("leaves every other column as a plain, non-clickable cell", () => {
    const html = rendererRegistry.render("table", [{ id: "SAL-QTN-2026-00014", customer: "Acme" }], intent);
    expect(html).toContain("<td>Acme</td>");
  });

  it("does not add a clickable id when neither 'id' nor 'name' is present", () => {
    const html = rendererRegistry.render("table", [{ customer: "Acme", total: 100 }], intent);
    expect(html).not.toContain("erp-agent-row-id-link");
  });

  it("still renders model-supplied next_steps below the table (distinct actions stay)", () => {
    const html = rendererRegistry.render("table", [{ id: "SAL-QTN-2026-00014", customer: "Acme" }], {
      render: "table",
      next_steps: ["Convert SAL-QTN-2026-00014 to Sales Order"],
    });
    expect(html).toContain('data-action="Convert SAL-QTN-2026-00014 to Sales Order"');
  });
});

// Confirmed live 2026-08-12: a table cell whose value was itself a nested
// object/array rendered as the literal text "[object Object]" — plain
// `String(value)` is JS's default toString() coercion, not JSON.stringify,
// and always collapses any plain object to that one useless string.
describe("table renderer — nested object/array cell values", () => {
  const intent: DisplayIntent = { render: "table" };

  it("stringifies a nested object cell as real JSON instead of '[object Object]'", () => {
    const html = rendererRegistry.render("table", [{ id: "X", contact: { name: "Acme", email: "a@acme.com" } }], intent);
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Acme");
  });

  it("leaves a null/undefined cell as an empty cell, not the string 'null'/'undefined'", () => {
    const html = rendererRegistry.render("table", [{ id: "X", note: null }], intent);
    expect(html).not.toContain(">null<");
    expect(html).not.toContain(">undefined<");
  });
});
