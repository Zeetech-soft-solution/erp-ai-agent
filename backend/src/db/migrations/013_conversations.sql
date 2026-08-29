-- Persistent, multi-thread chat history (previously: a chat's only "memory"
-- was sessionCacheProvider's in-memory-per-login-session cache, wiped on
-- logout/restart and never visible as a browsable transcript at all — a
-- user had no way to come back and see yesterday's conversation). Deliberately
-- separate from interaction_log (docs/TRAINING_PLAN.md's training-data plan,
-- prompt + tool_calls + metadata only, no full response text) — this table
-- exists purely to let the UI replay a real transcript, not to double as an
-- audit log.
create table if not exists conversations (
  id               uuid primary key,
  user_email       text not null,
  title            text not null default 'New chat',
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);
-- Powers both the "last 3 days" default list (last_message_at > now() -
-- interval '3 days') and the "load older" pagination (last_message_at <
-- cursor) — same index serves both queries, always ordered by recency.
create index if not exists conversations_user_recency_idx on conversations (user_email, last_message_at desc);

create table if not exists conversation_messages (
  id               uuid primary key,
  conversation_id  uuid not null references conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'agent')),
  prompt           text,        -- set when role = 'user'
  response         jsonb,       -- set when role = 'agent' — the full AgentResponse (type/message/data/html/document/meta), so a replayed turn renders identically to how it looked live
  silent           boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists conversation_messages_conv_idx on conversation_messages (conversation_id, created_at);
