import { sessionCacheProvider } from "../sessionCacheProvider";
import { Session } from "../../../core/types";
import { appConfig } from "../../../config/app.config";

function makeSession(sessionId: string, sub = "user@example.in"): Session {
  return { sub, erpnext_roles: [], allowed_tools: [], credential: { mode: "api_key" }, sessionId };
}

describe("sessionCacheProvider", () => {
  // Each test uses its own unique sessionId (the singleton is shared
  // module-wide) so tests never see another test's leftover state, then
  // cleans up after itself the same way logout does in auth.routes.ts.
  const usedIds: string[] = [];
  afterEach(() => {
    while (usedIds.length) sessionCacheProvider.clear(usedIds.pop()!);
  });

  it("keeps recent turns and returns them most-recent-first on fetch", async () => {
    const id = "sess-order-1";
    usedIds.push(id);
    sessionCacheProvider.addTurn(id, { prompt: "first", summary: "first summary" });
    sessionCacheProvider.addTurn(id, { prompt: "second", summary: "second summary" });

    const chunks = await sessionCacheProvider.fetch(makeSession(id), "irrelevant", 10000);
    const turnChunks = chunks.filter((c) => c.label === "recent_turn");
    expect(turnChunks.map((c) => c.content)).toEqual(["second summary", "first summary"]);
  });

  it("caps stored turns at appConfig.context.sessionCacheTurns, dropping the oldest first", async () => {
    const id = "sess-cap-1";
    usedIds.push(id);
    const cap = appConfig.context.sessionCacheTurns;
    for (let i = 0; i < cap + 3; i++) {
      sessionCacheProvider.addTurn(id, { prompt: `p${i}`, summary: `s${i}` });
    }
    const chunks = await sessionCacheProvider.fetch(makeSession(id), "x", 100000);
    const turnChunks = chunks.filter((c) => c.label === "recent_turn");
    expect(turnChunks.length).toBe(cap);
    // the oldest 3 (s0, s1, s2) must have been evicted
    expect(turnChunks.map((c) => c.content)).not.toEqual(expect.arrayContaining(["s0", "s1", "s2"]));
  });

  it("includes a current_focus chunk only when a focus key has been set", async () => {
    const idNoFocus = "sess-nofocus-1";
    usedIds.push(idNoFocus);
    const withoutFocus = await sessionCacheProvider.fetch(makeSession(idNoFocus), "x", 10000);
    expect(withoutFocus.find((c) => c.label === "current_focus")).toBeUndefined();

    const idFocus = "sess-focus-1";
    usedIds.push(idFocus);
    sessionCacheProvider.setFocus(idFocus, "current_lead", "LEAD-0001");
    const withFocus = await sessionCacheProvider.fetch(makeSession(idFocus), "x", 10000);
    const focusChunk = withFocus.find((c) => c.label === "current_focus");
    expect(focusChunk).toBeDefined();
    expect(JSON.parse(focusChunk!.content)).toEqual({ current_lead: "LEAD-0001" });
  });

  it("trims returned chunks to the given character budget", async () => {
    const id = "sess-budget-1";
    usedIds.push(id);
    sessionCacheProvider.addTurn(id, { prompt: "p1", summary: "a".repeat(50) });
    sessionCacheProvider.addTurn(id, { prompt: "p2", summary: "b".repeat(50) });
    // Only enough budget for the first (most recent) chunk returned.
    const chunks = await sessionCacheProvider.fetch(makeSession(id), "x", 50);
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe("b".repeat(50));
  });

  it("isolates memory per sessionId, never falling back to another session for the same user", async () => {
    const idA = "sess-isolate-a";
    const idB = "sess-isolate-b";
    usedIds.push(idA, idB);
    sessionCacheProvider.addTurn(idA, { prompt: "only in A", summary: "A's turn" });
    const chunksB = await sessionCacheProvider.fetch(makeSession(idB), "x", 10000);
    expect(chunksB.filter((c) => c.label === "recent_turn")).toEqual([]);
  });

  // Confirmed live 2026-08-12: a genuinely empty report result used to
  // leave the PRIOR turn's focus untouched, so a later "the first one
  // in that list" silently answered about a stale, different-entity
  // focus from two turns ago with no disclaimer.
  it("clearFocusKey() removes only the named key, leaving other focus keys and turns intact", async () => {
    const id = "sess-clearkey-1";
    usedIds.push(id);
    sessionCacheProvider.addTurn(id, { prompt: "p", summary: "s" });
    sessionCacheProvider.setFocus(id, "recent_list", "opportunity: OPP-1");
    sessionCacheProvider.setFocus(id, "other_key", "keep-me");
    sessionCacheProvider.clearFocusKey(id, "recent_list");
    const chunks = await sessionCacheProvider.fetch(makeSession(id), "x", 10000);
    const focusChunk = chunks.find((c) => c.label === "current_focus");
    expect(JSON.parse(focusChunk!.content)).toEqual({ other_key: "keep-me" });
    expect(chunks.some((c) => c.label === "recent_turn")).toBe(true);
  });

  it("clearFocusKey() on a session with no focus at all is a harmless no-op", () => {
    expect(() => sessionCacheProvider.clearFocusKey("sess-never-existed", "recent_list")).not.toThrow();
  });

  it("clear() removes both turns and focus for that session", async () => {
    const id = "sess-clear-1";
    sessionCacheProvider.addTurn(id, { prompt: "p", summary: "s" });
    sessionCacheProvider.setFocus(id, "k", "v");
    sessionCacheProvider.clear(id);
    const chunks = await sessionCacheProvider.fetch(makeSession(id), "x", 10000);
    expect(chunks).toEqual([]);
  });

  // Confirmed live 2026-08-12, the day multi-thread chat history shipped:
  // a brand-new "New chat" thread still answered using the PREVIOUS
  // thread's leftover focus/turns, because this class's memory was scoped
  // to the whole login session, not to which conversation thread is
  // currently open.
  describe("switchConversation", () => {
    it("does nothing on the first call for a session (nothing to compare against yet)", async () => {
      const id = "sess-switch-first";
      usedIds.push(id);
      sessionCacheProvider.addTurn(id, { prompt: "p", summary: "keep-me" });
      sessionCacheProvider.switchConversation(id, "conv-A");
      const chunks = await sessionCacheProvider.fetch(makeSession(id), "x", 10000);
      expect(chunks.some((c) => c.content === "keep-me")).toBe(true);
    });

    it("is a no-op when the conversationId hasn't changed (ordinary turn within one thread)", async () => {
      const id = "sess-switch-same";
      usedIds.push(id);
      sessionCacheProvider.switchConversation(id, "conv-A");
      sessionCacheProvider.addTurn(id, { prompt: "p", summary: "keep-me" });
      sessionCacheProvider.switchConversation(id, "conv-A");
      const chunks = await sessionCacheProvider.fetch(makeSession(id), "x", 10000);
      expect(chunks.some((c) => c.content === "keep-me")).toBe(true);
    });

    it("clears turns and focus when the conversationId actually changes", async () => {
      const id = "sess-switch-change";
      usedIds.push(id);
      sessionCacheProvider.switchConversation(id, "conv-A");
      sessionCacheProvider.addTurn(id, { prompt: "p", summary: "from thread A" });
      sessionCacheProvider.setFocus(id, "current_lead", "LEAD-A");

      sessionCacheProvider.switchConversation(id, "conv-B"); // simulates opening a different thread

      const chunks = await sessionCacheProvider.fetch(makeSession(id), "x", 10000);
      expect(chunks).toEqual([]);
    });

    it("ignores an undefined conversationId rather than clearing anything (e.g. history persistence failed this turn)", async () => {
      const id = "sess-switch-undefined";
      usedIds.push(id);
      sessionCacheProvider.switchConversation(id, "conv-A");
      sessionCacheProvider.addTurn(id, { prompt: "p", summary: "keep-me" });
      sessionCacheProvider.switchConversation(id, undefined);
      const chunks = await sessionCacheProvider.fetch(makeSession(id), "x", 10000);
      expect(chunks.some((c) => c.content === "keep-me")).toBe(true);
    });
  });
});
