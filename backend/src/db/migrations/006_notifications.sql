-- Durable home for proactive alerts (see core/alertStore.ts,
-- routes/webhooks.routes.ts). Previously an in-memory, drain-once queue -
-- lost on every backend restart and delivered to at most one poller ever.
-- Now: every alert is written here the instant it arrives, and read is a
-- replayable query (full history on first load, delta-since-cursor on
-- every subsequent poll), not a one-shot consume.
create table if not exists notifications (
  id           uuid primary key,
  user_email   text not null,
  entity_key   text,
  record_id    text,
  message      text not null,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists notifications_user_created_idx on notifications (user_email, created_at desc);
