-- Requires: CREATE EXTENSION IF NOT EXISTS vector;  (run once as superuser)
create extension if not exists vector;

-- WARM context tier: anything embedded and searchable (past conversations,
-- ERPNext comments, ticket bodies, KB docs...). owner_scope lets you keep
-- a chunk private to one user ('user@x.com') or shared ('global').
create table if not exists context_embeddings (
  id            bigserial primary key,
  owner_scope   text not null,
  label         text not null,
  content       text not null,
  embedding     vector(1536) not null,   -- match your embedding model's dim
  created_at    timestamptz not null default now()
);
create index if not exists context_embeddings_ivfflat
  on context_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Interaction log: this table IS the training data pipeline's source of
-- truth. Nothing here should ever be deleted casually — it's the record
-- of every prompt -> tool decision -> outcome the system has made.
create table if not exists interaction_log (
  id                     bigserial primary key,
  actor_email            text not null,
  roles                  text[] not null,
  prompt                 text not null,
  context_sources_used   text[] not null default '{}',
  tool_calls             jsonb not null default '[]',
  response_type          text not null,
  render_kind            text,
  latency_ms             integer not null,
  feedback               smallint,          -- null / -1 / +1, added later via UI
  created_at             timestamptz not null default now()
);
create index if not exists interaction_log_user_idx on interaction_log (actor_email);
create index if not exists interaction_log_created_idx on interaction_log (created_at);
