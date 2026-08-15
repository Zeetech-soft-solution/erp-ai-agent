import { escapeHtml } from "../escape";

describe("escapeHtml", () => {
  it("escapes all five special characters", () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;"
    );
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("Acme Corp")).toBe("Acme Corp");
  });

  it("neutralizes an attribute-breakout attempt (the actual threat model — untrusted tool data reaching an HTML attribute)", () => {
    const malicious = `" onmouseover="alert(1)`;
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain('"');
    expect(escaped).toBe("&quot; onmouseover=&quot;alert(1)");
  });

  it("handles an empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
