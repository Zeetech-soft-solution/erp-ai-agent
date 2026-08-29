-- Global, admin-editable OPERATIONAL settings only. Secrets (API keys,
-- DB URL, JWT secret) never live here — they stay in .env. This table
-- is deliberately schemaless (jsonb value) so adding a new setting is
-- a UI + seed-row change, not a migration.
create table if not exists settings (
  key          text primary key,
  value        jsonb not null,
  label        text not null,
  description  text,
  value_type   text not null default 'string', -- string | number | boolean
  updated_by   text,
  updated_at   timestamptz not null default now()
);

insert into settings (key, value, label, description, value_type) values
  ('org_display_name', '"My Company"', 'Organization name', 'Shown in the admin and agent app headers', 'string'),
  ('maintenance_mode', 'false', 'Maintenance mode', 'When on, the agent app shows a maintenance banner and blocks new prompts', 'boolean'),
  ('llm_model', '"gpt-4o-mini"', 'LLM model', 'Model name passed to the LLM provider', 'string'),
  ('llm_max_tool_iterations', '5', 'Max tool iterations', 'Safety cap on tool-call loops per prompt', 'number'),
  ('context_budget_chars', '6000', 'Context budget (chars)', 'Total character budget for assembled context per prompt', 'number'),
  ('context_vector_topk', '5', 'Vector search top-K', 'Number of chunks pulled from the vector store per query', 'number')
on conflict (key) do nothing;

create table if not exists admin_audit_log (
  id           bigserial primary key,
  admin_user   text not null,
  action       text not null,      -- e.g. "update_setting"
  target       text,                -- e.g. setting key
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);
