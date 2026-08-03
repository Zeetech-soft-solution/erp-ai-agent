import { Pool } from "pg";
import { appConfig } from "../config/app.config";
import { Alert } from "./types";

export interface StoredNotification extends Alert {
  readAt: string | null;
}

/**
 * Durable, replayable notification feed backed by Postgres (see
 * db/migrations/006_notifications.sql) — NOT the in-memory, drain-once
 * queue this used to be. That version lost everything on a backend
 * restart and delivered each alert to at most one poller ever, which
 * broke the moment more than one page (Chat AND a Notifications tab)
 * wanted to read the same feed. `list()` is a plain query: full recent
 * history with no cursor, or only what's arrived since one, with nothing
 * ever consumed/removed by reading it.
 */
class AlertStore {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;

  async push(userEmail: string, alert: Alert): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `insert into notifications (id, user_email, entity_key, record_id, message, created_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [alert.id, userEmail, alert.entityKey, alert.recordId, alert.message, alert.createdAt]
    );
  }

  /** No `since` = most recent history (bounded). With `since` = only what's arrived after that timestamp, for polling. */
  async list(userEmail: string, since?: string, limit = 50): Promise<StoredNotification[]> {
    if (!this.pool) return [];
    const { rows } = since
      ? await this.pool.query(
          `select id, entity_key as "entityKey", record_id as "recordId", message,
                  created_at as "createdAt", read_at as "readAt"
           from notifications where user_email = $1 and created_at > $2
           order by created_at asc`,
          [userEmail, since]
        )
      : await this.pool.query(
          `select id, entity_key as "entityKey", record_id as "recordId", message,
                  created_at as "createdAt", read_at as "readAt"
           from notifications where user_email = $1
           order by created_at desc limit $2`,
          [userEmail, limit]
        );
    return rows;
  }

  async markRead(userEmail: string, id: string): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`update notifications set read_at = now() where id = $1 and user_email = $2`, [id, userEmail]);
  }
}

export const alertStore = new AlertStore();
