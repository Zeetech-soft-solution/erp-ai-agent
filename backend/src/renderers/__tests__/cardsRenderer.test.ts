import "../cardsRenderer";
import { rendererRegistry } from "../../core/rendererRegistry";
import { DisplayIntent } from "../../core/types";

// "cards" used to be a plain alias for the table renderer (a one-row
// table) — this suite locks in its own distinct, deterministic layout
// instead: a vertical label:value list per field, since that's the real
// improvement over a one-row table for a many-field single record (see
// this file's own doc comment, and reasoningEngine.ts's isSingleRecord).
describe("cards renderer — single-record detail view", () => {
  const intent: DisplayIntent = { render: "cards" };

  it("renders one label:value row per field, not a table", () => {
    const html = rendererRegistry.render("cards", { id: "SAL-QTN-2026-00014", customer: "Acme", total: 500 }, intent);
    expect(html).not.toContain("<table");
    expect(html).toContain('class="erp-agent-card"');
    expect(html).toContain('class="erp-agent-card-label">id<');
    expect(html).toContain('class="erp-agent-card-value">SAL-QTN-2026-00014<');
    expect(html).toContain('class="erp-agent-card-label">customer<');
    expect(html).toContain('class="erp-agent-card-value">Acme<');
  });

  it("accepts a bare object directly (the real shape *.get() always returns)", () => {
    const html = rendererRegistry.render("cards", { id: "X", status: "Open" }, intent);
    expect(html).toContain('class="erp-agent-card-value">Open<');
  });

  it("defensively also accepts an array, rendering one stacked card per record", () => {
    const html = rendererRegistry.render("cards", [{ id: "A" }, { id: "B" }], intent);
    const cardCount = (html.match(/class="erp-agent-card"/g) || []).length;
    expect(cardCount).toBe(2);
    expect(html).toContain('class="erp-agent-card-value">A<');
    expect(html).toContain('class="erp-agent-card-value">B<');
  });

  it("shows an em dash for a null/undefined field instead of an empty or literal 'null' value", () => {
    const html = rendererRegistry.render("cards", { id: "X", note: null }, intent);
    expect(html).toContain('class="erp-agent-card-value">—<');
    expect(html).not.toContain(">null<");
  });

  it("stringifies a nested object field as real JSON instead of '[object Object]' (same guard as the table renderer)", () => {
    const html = rendererRegistry.render("cards", { id: "X", contact: { name: "Acme", email: "a@acme.com" } }, intent);
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Acme");
  });

  it("still renders model-supplied/deterministic next_steps below the card", () => {
    const html = rendererRegistry.render("cards", { id: "SAL-QTN-2026-00014", status: "Open" }, {
      render: "cards",
      next_steps: ["Convert SAL-QTN-2026-00014 to Sales Order"],
    });
    expect(html).toContain('data-action="Convert SAL-QTN-2026-00014 to Sales Order"');
  });

  it("returns an empty-state message rather than an empty card for no data", () => {
    const html = rendererRegistry.render("cards", null, intent);
    expect(html).toContain("erp-agent-empty");
  });
});
