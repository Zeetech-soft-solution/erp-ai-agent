import { randomUUID } from "crypto";
import { Pool } from "pg";
import { appConfig } from "../config/app.config";

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
}

/**
 * Durable log of emails actually sent via the email.send tool (see
 * modules/email/index.ts) - same replayable-query discipline as
 * alertStore.ts. This is what lets the Email tab's Sent view show a real
 * tool execution instead of the frontend guessing that a reply "probably"
 * went out.
 */
class SentEmailStore {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;

  async push(userEmail: string, email: { to: string; subject: string; body: string }): Promise<SentEmail> {
    const id = randomUUID();
    const sentAt = new Date().toISOString();
    if (this.pool) {
      await this.pool.query(
        `insert into sent_emails (id, user_email, to_email, subject, body, sent_at) values ($1, $2, $3, $4, $5, $6)`,
        [id, userEmail, email.to, email.subject, email.body, sentAt]
      );
    }
    return { id, to: email.to, subject: email.subject, body: email.body, sentAt };
  }

  async list(userEmail: string, limit = 50): Promise<SentEmail[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(
      `select id, to_email as "to", subject, body, sent_at as "sentAt"
       from sent_emails where user_email = $1
       order by sent_at desc limit $2`,
      [userEmail, limit]
    );
    return rows;
  }
}

export const sentEmailStore = new SentEmailStore();
