import { rendererRegistry, renderNextSteps } from "../rendererRegistry";
import { DisplayIntent } from "../types";

function intent(overrides: Partial<DisplayIntent> = {}): DisplayIntent {
  return { render: "raw", ...overrides };
}

describe("renderNextSteps", () => {
  it("returns an empty string when there are no next_steps", () => {
    expect(renderNextSteps(intent())).toBe("");
  });

  it("renders one button per step with the label as both text and data-action", () => {
    const html = renderNextSteps(intent({ next_steps: ["Mark as won"] }));
    expect(html).toContain('data-action="Mark as won"');
    expect(html).toContain(">Mark as won</button>");
    expect(html).toContain('class="erp-agent-next-step"');
  });

  it("escapes HTML-unsafe characters in a step label (e.g. a customer name containing a quote)", () => {
    const html = renderNextSteps(intent({ next_steps: [`Convert "Acme & Co"'s quote`] }));
    expect(html).not.toContain(`"Acme & Co"`);
    expect(html).toContain("&quot;Acme &amp; Co&quot;");
  });

  it("wraps multiple steps in a single container div", () => {
    const html = renderNextSteps(intent({ next_steps: ["Step A", "Step B"] }));
    expect(html.match(/erp-agent-next-steps/g)?.length).toBe(1);
    expect(html.match(/erp-agent-next-step"/g)?.length).toBe(2);
  });
});

describe("rendererRegistry", () => {
  it("falls back to the 'raw' renderer for an unregistered render kind", () => {
    const html = rendererRegistry.render("some_unregistered_kind", { a: 1 }, intent());
    expect(html).toContain("erp-agent-raw");
    // raw's JSON dump is HTML-escaped like everything else (untrusted
    // tool data can end up here) — quotes come through as &quot;.
    expect(html).toContain("&quot;a&quot;: 1");
  });

  it("falls back to 'raw' when the matched renderer throws", () => {
    rendererRegistry.register("throws", () => {
      throw new Error("boom");
    });
    const html = rendererRegistry.render("throws", { ok: true }, intent());
    expect(html).toContain("erp-agent-raw");
    expect(html).toContain("&quot;ok&quot;: true");
  });

  it("'none' renders only the next_steps button row, with no data body", () => {
    const html = rendererRegistry.render("none", { should: "not appear" }, intent({ next_steps: ["Confirm"] }));
    expect(html).not.toContain("should");
    expect(html).toContain("Confirm");
  });

  it("a custom registered renderer is used over the raw fallback", () => {
    rendererRegistry.register("custom", (data) => `<span>${(data as { label: string }).label}</span>`);
    const html = rendererRegistry.render("custom", { label: "hi" }, intent());
    expect(html).toBe("<span>hi</span>");
  });
});
