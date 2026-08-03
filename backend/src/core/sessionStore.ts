import { randomUUID } from "crypto";
import { Session } from "./types";

/**
 * SECURITY-MOTIVATED DESIGN: the agent's JWT (held in the browser)
 * now carries only an opaque sessionId — never the ERPNext session
 * cookie or personal API key/secret. The actual UserCredential lives
 * ONLY here, server-side. A leaked/stolen JWT gets you nothing against
 * ERPNext directly; it's useless without also compromising this store
 * (or the running server's memory). This is strictly better than
 * embedding the credential inside the JWT payload, which is base64,
 * not encrypted, and would hand over real ERPNext access the moment a
 * token leaked anywhere (logs, browser extensions, a proxy).
 *
 * In-memory + TTL for a single instance today. Swap for Redis (same
 * shape: set/get/delete with TTL) the moment you run more than one
 * backend process, since sessions must be visible across instances.
 */
interface StoredEntry {
  session: Session;
  expiresAt: number;
}

class SessionStore {
  private store = new Map<string, StoredEntry>();
  private ttlMs = 8 * 60 * 60 * 1000; // matches AGENT_JWT_EXPIRES_IN default

  create(session: Session): string {
    const sessionId = randomUUID();
    this.store.set(sessionId, { session, expiresAt: Date.now() + this.ttlMs });
    return sessionId;
  }

  get(sessionId: string): Session | null {
    const entry = this.store.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionId);
      return null;
    }
    return entry.session;
  }

  destroy(sessionId: string) {
    this.store.delete(sessionId);
  }

  /** Invalidates every active session for a user — used when an admin
   *  rotates or revokes their stored credential, so a session already
   *  in someone's browser can't keep acting under the old key. */
  destroyAllForUser(userEmail: string) {
    for (const [id, entry] of this.store.entries()) {
      if (entry.session.sub === userEmail) this.store.delete(id);
    }
  }

  /** One session per currently-logged-in user (dedupes multiple tabs/
   *  logins by the same person) — used by core/erpnextNotificationSync.ts
   *  so the background poll only ever calls out for people actually using
   *  the agent right now, never the full user directory. */
  getActiveSessions(): Session[] {
    const now = Date.now();
    const byUser = new Map<string, Session>();
    for (const entry of this.store.values()) {
      if (entry.expiresAt > now) byUser.set(entry.session.sub, entry.session);
    }
    return Array.from(byUser.values());
  }
}

export const sessionStore = new SessionStore();
