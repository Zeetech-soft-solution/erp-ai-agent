import { titleFromPrompt } from "../conversationStore";

// A conversation's title is derived once, from its first prompt, purely so
// the "last 3 days" sidebar list has something readable to show without an
// extra LLM call. This suite covers only that pure derivation — the store's
// DB-touching methods have no test coverage yet, same as every other
// Postgres-backed store in this codebase (see conversationStore.ts's own
// doc comment; a real test DB would be needed for those).
describe("titleFromPrompt", () => {
  it("uses the prompt as-is when it's already short", () => {
    expect(titleFromPrompt("What's our company name?")).toBe("What's our company name?");
  });

  it("trims surrounding whitespace and collapses internal runs of it", () => {
    expect(titleFromPrompt("  What's   our company name?  ")).toBe("What's our company name?");
  });

  it("truncates a long prompt at a word boundary, with a trailing ellipsis", () => {
    const prompt = "Show accounts receivable and tell me our top 3 customers by amount owed.";
    const title = titleFromPrompt(prompt);
    expect(title.length).toBeLessThanOrEqual(61); // 60 chars + ellipsis
    expect(title.endsWith("…")).toBe(true);
    expect(prompt.startsWith(title.slice(0, -1))).toBe(true); // never cuts mid-word into a different word
    expect(title.endsWith(" …")).toBe(false); // no dangling space before the ellipsis
  });

  it("falls back to a hard cut only when there's no reasonable word boundary", () => {
    const prompt = "a".repeat(100); // one giant unbroken "word"
    const title = titleFromPrompt(prompt);
    expect(title).toBe(`${"a".repeat(60)}…`);
  });

  it("falls back to a generic title for an empty/whitespace-only prompt", () => {
    expect(titleFromPrompt("   ")).toBe("New chat");
  });
});
