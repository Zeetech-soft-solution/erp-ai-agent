// THE boundary for real mailbox integration — same discipline as
// core/types.ts's SystemConnector. Nothing outside providers/mail/ may
// ever call an IMAP/SMTP library or a provider API (Gmail, Graph)
// directly; everything goes through this interface so swapping the stub
// for a real mailbox later is a one-file change (see stubMailboxConnector.ts).
export interface MailMessage {
  from: string;
  subject: string;
  preview: string;
  receivedAt: string;
}

export interface SentMail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
}

export interface MailboxConnector {
  listInbox(userEmail: string, folder?: string): Promise<MailMessage[]>;
  send(userEmail: string, mail: { to: string; subject: string; body: string }): Promise<SentMail>;
  listSent(userEmail: string, limit?: number): Promise<SentMail[]>;
}
