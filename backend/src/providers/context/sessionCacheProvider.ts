import { ContextProvider, ContextChunk, Session } from "../../core/types";
import { appConfig } from "../../config/app.config";

/**
 * HOT tier. In-memory to start (swap the internal Map for Redis later —
 * this class's public shape doesn't change, only its constructor).
 * Stores recent turns per LOGIN SESSION + "entities in focus" (referenced
 * by id, not dumped as full text) so the LLM has short-term continuity
 * without re-sending full history every turn.
 *
 * Keyed by session.sessionId, NOT session.sub (user email) — deliberately
 * changed 2026-08-09 after confirming live that email-keying let a second
 * login (a new tab, a new device, or even just testing the same account
 * again minutes later) inherit another active session's leftover
 * conversation state ("Convert SAL-QTN-2026-00047" got answered from a
 * stale candidate list that wasn't even the one just shown in the CURRENT
 * conversation). Multiple simultaneous devices/tabs for the same user are
 * still fully supported — they just now get independent memory each,
 * same as two different people would, which is what a chat "session" is
 * generally expected to mean.
 */
interface Turn { prompt: string; summary: string; }

class SessionCacheProvider implements ContextProvider {
  name = "session_cache";
  private turnsBySession = new Map<string, Turn[]>();
  private focusBySession = new Map<string, Record<string, string>>(); // e.g. { current_lead: "LEAD-0001" }
  private activeConversationBySession = new Map<string, string>();

  /**
   * Confirmed live 2026-08-12, the day multi-thread chat history
   * (core/conversationStore.ts) shipped: one login session can now span
   * several separate conversation threads, but this class's memory was
   * still scoped to the WHOLE login session — starting a brand-new thread
   * (or reopening an older one) silently kept answering from whatever the
   * model was just focused on in a DIFFERENT thread ("what's the status
   * of quotation X" in a fresh "New chat" still answered about the
   * previous thread's quotation). A thread switch now resets this
   * session's short-term memory; ordinary turns WITHIN one thread
   * (conversationId unchanged) are completely unaffected — this only
   * fires at a genuine thread boundary, not on every turn.
   */
  switchConversation(sessionId: string, conversationId: string | undefined) {
    if (!conversationId) return; // nothing to compare against (e.g. conversation-history persistence itself failed this turn) — safer to leave memory as-is than guess
    const previous = this.activeConversationBySession.get(sessionId);
    if (previous && previous !== conversationId) this.clear(sessionId);
    this.activeConversationBySession.set(sessionId, conversationId);
  }

  addTurn(sessionId: string, turn: Turn) {
    const list = this.turnsBySession.get(sessionId) || [];
    list.push(turn);
    while (list.length > appConfig.context.sessionCacheTurns) list.shift();
    this.turnsBySession.set(sessionId, list);
  }

  setFocus(sessionId: string, key: string, value: string) {
    const map = this.focusBySession.get(sessionId) || {};
    map[key] = value;
    this.focusBySession.set(sessionId, map);
  }

  /** Confirmed live 2026-08-12: "list open opportunities" (genuinely 0
   *  real rows, not a bug — see agent.routes.ts's recordListFocus)
   *  simply left the PRIOR turn's focus untouched, since there was
   *  nothing new to set it to. A later "the first one in that list"
   *  then silently reused that two-turns-stale focus (a Lead) as if it
   *  answered the Opportunity question — worse than no focus at all,
   *  since it's actively wrong with no disclaimer. An empty result
   *  always means "nothing here to reference" for whatever key it was
   *  about — clear it explicitly instead of leaving it stale. */
  clearFocusKey(sessionId: string, key: string) {
    const map = this.focusBySession.get(sessionId);
    if (map) delete map[key];
  }

  /** Called on logout (auth.routes.ts) — frees this session's memory
   *  immediately rather than leaving it to expire on its own; harmless
   *  either way since it's already scoped to a single ended session, not
   *  shared user state. */
  clear(sessionId: string) {
    this.turnsBySession.delete(sessionId);
    this.focusBySession.delete(sessionId);
    this.activeConversationBySession.delete(sessionId);
  }

  async fetch(session: Session, _prompt: string, budgetChars: number): Promise<ContextChunk[]> {
    // sessionId is always populated for a real authenticated request
    // (see core/types.ts's Session.sessionId doc comment) — the fallback
    // to session.sub only guards the theoretical case of a caller that
    // somehow skipped auth/middleware.ts, not a real code path today.
    const key = session.sessionId || session.sub;
    const turns = this.turnsBySession.get(key) || [];
    const focus = this.focusBySession.get(key) || {};

    const chunks: ContextChunk[] = [];
    if (Object.keys(focus).length) {
      chunks.push({ source: "session_cache", label: "current_focus", content: JSON.stringify(focus) });
    }
    for (const t of turns.slice().reverse()) {
      chunks.push({ source: "session_cache", label: "recent_turn", content: t.summary });
    }

    // trim to budget
    let used = 0;
    return chunks.filter((c) => (used += c.content.length) <= budgetChars);
  }
}

export const sessionCacheProvider = new SessionCacheProvider();
