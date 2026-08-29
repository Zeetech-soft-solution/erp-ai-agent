import { randomUUID } from "crypto";
import { Pool } from "pg";
import { appConfig } from "../config/app.config";
import { AgentResponse } from "./types";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "agent";
  prompt: string | null;
  response: AgentResponse | null;
  silent: boolean;
  createdAt: string;
}

// A short, readable thread title from the first prompt — same "cheap,
// good-enough, no LLM call" discipline as every other display-label
// derivation in this codebase (e.g. agent.routes.ts's FOCUS_LABEL_FIELDS).
// Breaks on a word boundary rather than a hard character cut so it never
// ends mid-word.
export function titleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed || "New chat";
  const cut = trimmed.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 20 ? lastSpace : 60)}…`;
}

/**
 * Durable, multi-thread chat history — see db/migrations/013_conversations.sql
 * for why this is a separate table from interaction_log rather than an
 * extension of it. Every read is scoped to (id, userEmail) together, never
 * id alone — a conversation_id is just a UUID a client sends back, and
 * nothing stops one user's browser from holding/guessing another user's id;
 * the user_email match is the actual access boundary, same discipline as
 * ERPNext's own DocPerm scoping everywhere else in this app.
 */
class ConversationStore {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;

  async create(userEmail: string, firstPrompt: string): Promise<ConversationSummary> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const title = titleFromPrompt(firstPrompt);
    if (this.pool) {
      await this.pool.query(
        `insert into conversations (id, user_email, title, created_at, last_message_at) values ($1, $2, $3, $4, $4)`,
        [id, userEmail, title, now]
      );
    }
    return { id, title, createdAt: now, lastMessageAt: now };
  }

  /** Default view: threads touched within the last N days (3, per the
   *  chat UI's own default), newest first. Cheap even after months of
   *  daily use — only title + timestamps, never message bodies. */
  async listRecent(userEmail: string, sinceDays: number): Promise<ConversationSummary[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(
      `select id, title, created_at as "createdAt", last_message_at as "lastMessageAt"
       from conversations
       where user_email = $1 and last_message_at > now() - ($2 || ' days')::interval
       order by last_message_at desc`,
      [userEmail, sinceDays]
    );
    return rows;
  }

  /** "Load older" pagination beyond the default window — cursor-based on
   *  last_message_at (a plain OFFSET would double-count/skip rows if a
   *  conversation gets a new message between page loads; a "strictly
   *  before this timestamp" cursor can't). */
  async listOlder(userEmail: string, beforeIso: string, limit: number): Promise<ConversationSummary[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(
      `select id, title, created_at as "createdAt", last_message_at as "lastMessageAt"
       from conversations
       where user_email = $1 and last_message_at < $2
       order by last_message_at desc
       limit $3`,
      [userEmail, beforeIso, limit]
    );
    return rows;
  }

  /** Ownership-checked: returns [] for a real conversation id that isn't
   *  this user's own, same as if it didn't exist — never distinguishes
   *  "not found" from "not yours" to a caller. */
  async getMessages(conversationId: string, userEmail: string): Promise<StoredMessage[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(
      `select m.id, m.role, m.prompt, m.response, m.silent, m.created_at as "createdAt"
       from conversation_messages m
       join conversations c on c.id = m.conversation_id
       where m.conversation_id = $1 and c.user_email = $2
       order by m.created_at asc`,
      [conversationId, userEmail]
    );
    return rows;
  }

  async appendUserMessage(conversationId: string, prompt: string, silent: boolean): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `insert into conversation_messages (id, conversation_id, role, prompt, silent) values ($1, $2, 'user', $3, $4)`,
      [randomUUID(), conversationId, prompt, silent]
    );
  }

  async appendAgentMessage(conversationId: string, response: AgentResponse): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `insert into conversation_messages (id, conversation_id, role, response) values ($1, $2, 'agent', $3)`,
      [randomUUID(), conversationId, JSON.stringify(response)]
    );
    await this.pool.query(`update conversations set last_message_at = now() where id = $1`, [conversationId]);
  }

  /** Ownership-checked the same way getMessages is — a caller can only
   *  ever confirm/act on their own conversation id. */
  async belongsToUser(conversationId: string, userEmail: string): Promise<boolean> {
    if (!this.pool) return true; // no DB configured — nothing to check against, same fail-open as every other store here
    const { rows } = await this.pool.query(`select 1 from conversations where id = $1 and user_email = $2`, [conversationId, userEmail]);
    return rows.length > 0;
  }
}

export const conversationStore = new ConversationStore();
