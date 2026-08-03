import { MailboxConnector, MailMessage, SentMail } from "./types";
import { sentEmailStore } from "../../core/sentEmailStore";

/**
 * STUB implementation of MailboxConnector — no real IMAP/SMTP or provider
 * API behind this yet.
 *
 * listInbox() returns nothing real: the frontend's Email tab Inbox view
 * still renders its own local sample data (see frontend's
 * services/emailService.ts) rather than calling this. send()/listSent()
 * ARE real in the sense that they durably record to Postgres
 * (sentEmailStore, see db/migrations/007_sent_emails.sql) — only actual
 * outbound delivery is missing, so a confirmed reply shows up in the
 * Email tab's Sent view for real, it just never leaves this server.
 *
 * TO GO LIVE, implement a second class against this same interface:
 *
 *   (a) IMAP/SMTP — e.g. `imapflow` for listInbox(), `nodemailer` for
 *       send(). One mailbox per user, or one shared mailbox with a
 *       canonical "from" — either way the credential is a mailbox
 *       app-password or OAuth token, NOT Session.credential (that's the
 *       ERP login, a different system entirely). Store it per-user
 *       alongside user_credentials (see db/migrations/003_user_credentials.sql)
 *       or a new table next to it.
 *
 *   (b) A provider API — Gmail API or Microsoft Graph. OAuth per user;
 *       listInbox() = users.messages.list, send() = users.messages.send
 *       (Gmail) or POST /me/sendMail (Graph). listSent() can either read
 *       the provider's own Sent folder directly, or keep writing to
 *       sentEmailStore as a local mirror/audit trail alongside it.
 *
 * Then in modules/email/index.ts, swap the imported `mailboxConnector`
 * singleton below for `new <RealOne>Connector()` — nothing in core/,
 * routes/, or the frontend needs to change, same one-file-swap discipline
 * as SystemConnector (see core/types.ts).
 */
export class StubMailboxConnector implements MailboxConnector {
  async listInbox(): Promise<MailMessage[]> {
    return [];
  }

  async send(userEmail: string, mail: { to: string; subject: string; body: string }): Promise<SentMail> {
    return sentEmailStore.push(userEmail, mail);
  }

  async listSent(userEmail: string, limit?: number): Promise<SentMail[]> {
    return sentEmailStore.list(userEmail, limit);
  }
}

export const mailboxConnector: MailboxConnector = new StubMailboxConnector();
