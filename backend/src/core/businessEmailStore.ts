import { Pool } from "pg";
import { appConfig } from "../config/app.config";

export interface InboxThread {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: string;
  status: "none" | "replied" | "action_taken" | "resolved";
  quickReplyable: boolean;
  action?: { label: string; prompt: string };
  // ticket-only fields, undefined for kind='email'
  priority?: "Low" | "Medium" | "High";
  requester?: string;
}

/**
 * Read side: the `business_emails` schema erpdatabuild's
 * `simulate_email_activity.py` writes into nightly (same erp_agent_pg
 * Postgres instance/DATABASE_URL as sentEmailStore.ts,
 * workflowActionStore.ts, etc. — see that script's docstring for the
 * generation side, EMAIL_SIMULATION_PLAN.md for the design).
 *
 * Write side (`insertTestSend`): the ONE exception to "this store never
 * writes" — backs the "Email Send (test)" tab, which deliberately inserts
 * a synthetic INBOUND thread (a tester impersonating a customer, landing
 * in a chosen employee's real inbox) rather than calling the real
 * email.send tool (that tool always sends OUTBOUND, as whichever employee
 * is actually logged in — see modules/email/index.ts). Replying/acting on
 * anything already in the inbox is still always a real tool call
 * (email.send/tickets.resolve), never a write made from here — same "no
 * fake instant action" discipline as the rest of this codebase's stores.
 *
 * `assigned_user_email` on each thread is the real credentialed employee
 * it belongs to, so this is naturally scoped per logged-in user — Priya's
 * login only ever sees Priya's inbox, same as a real mailbox.
 */
class BusinessEmailStore {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;

  async list(userEmail: string, kind: "email" | "ticket", limit = 50): Promise<InboxThread[]> {
    if (!this.pool) return [];
    let rows;
    try {
      ({ rows } = await this.pool.query(
        `select t.id, t.counterparty_email as "from", t.counterparty_name as "requester",
                t.subject, t.status, t.quick_replyable as "quickReplyable",
                t.action_label as "actionLabel", t.action_prompt as "actionPrompt",
                t.priority, t.created_at as "receivedAt",
                (select m.body from business_emails.messages m
                 where m.thread_id = t.id order by m.sent_at asc limit 1) as body
         from business_emails.threads t
         where t.assigned_user_email = $1 and t.kind = $2
         order by t.created_at desc limit $3`,
        [userEmail, kind, limit]
      ));
    } catch {
      // Schema not deployed yet on this environment (e.g. local dev without
      // erpdatabuild's cron having run) — same safe-empty fallback as every
      // other store here when its table/schema is missing, not a hard error.
      return [];
    }
    return rows.map((r: any) => ({
      id: r.id,
      from: r.from,
      subject: r.subject,
      preview: (r.body || "").slice(0, 180),
      receivedAt: r.receivedAt,
      status: r.status,
      quickReplyable: r.quickReplyable,
      action: r.actionLabel ? { label: r.actionLabel, prompt: r.actionPrompt } : undefined,
      priority: r.priority || undefined,
      requester: r.requester || r.from,
    }));
  }

  /** "Email Send (test)" — see class doc comment above. Always
   *  kind='email', quick_replyable=true (a tester-composed message is
   *  always a reasonable one to reply to), no related_doctype/action
   *  (nothing in ERPNext backs this one — it's a pure impersonation test). */
  async insertTestSend(args: { fromEmail: string; fromName: string; toEmail: string; subject: string; body: string }): Promise<InboxThread> {
    if (!this.pool) throw new Error("Email store not configured (DATABASE_URL missing)");
    const now = new Date().toISOString();
    const { rows } = await this.pool.query(
      `insert into business_emails.threads
         (kind, subject, counterparty_email, counterparty_name, assigned_user_email,
          status, quick_replyable, created_at)
       values ('email', $1, $2, $3, $4, 'none', true, $5)
       returning id`,
      [args.subject, args.fromEmail, args.fromName, args.toEmail, now]
    );
    const threadId = rows[0].id;
    await this.pool.query(
      `insert into business_emails.messages (thread_id, direction, from_email, to_email, body, sent_at)
       values ($1, 'inbound', $2, $3, $4, $5)`,
      [threadId, args.fromEmail, args.toEmail, args.body, now]
    );
    return {
      id: threadId,
      from: args.fromEmail,
      subject: args.subject,
      preview: args.body.slice(0, 180),
      receivedAt: now,
      status: "none",
      quickReplyable: true,
      requester: args.fromName,
    };
  }
}

export const businessEmailStore = new BusinessEmailStore();
