-- Every business-rule evaluation (see core/businessRuleEngine.ts,
-- core/ruleOutcomeLogger.ts) is logged here — the local database asset
-- for improving business-rule/contextual-decision accuracy over time:
-- which rules fire, how often they block vs. warn, and on what actual
-- arguments, per entity/action. Same "never delete casually" status as
-- interaction_log (see 001_init.sql) — this IS the training data.
create table if not exists rule_evaluations (
  id            bigserial primary key,
  entity_key    text not null,
  action        text not null,        -- "create" | "update"
  actor_email   text not null,
  allowed       boolean not null,
  violations    jsonb not null default '[]',   -- [{ ruleId, message, blocking }]
  args          jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists rule_evaluations_entity_idx on rule_evaluations (entity_key, action);
create index if not exists rule_evaluations_created_idx on rule_evaluations (created_at);
