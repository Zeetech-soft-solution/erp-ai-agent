-- Durable record of emails the agent has actually sent via the email.send
-- tool (see modules/email/index.ts, core/sentEmailStore.ts). This is what
-- makes a reply drafted+confirmed in chat show up in the Email tab's Sent
-- view - the tool handler writes here at the moment it executes, so the
-- Sent list reflects real tool calls, never an optimistic local guess.
create table if not exists sent_emails (
  id           uuid primary key,
  user_email   text not null,
  to_email     text not null,
  subject      text not null,
  body         text not null,
  sent_at      timestamptz not null default now()
);
create index if not exists sent_emails_user_sent_idx on sent_emails (user_email, sent_at desc);
