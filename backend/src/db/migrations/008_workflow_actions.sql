-- Generic durable log for "confirmed in chat, now really happened" actions
-- that aren't email (which has its own sent_emails table) - a support
-- ticket resolution, a project issue comment, etc. One shared shape
-- (module + record_key + action + detail) instead of a bespoke table per
-- module, since they're all the same "who did what to which record, and
-- what did they say" fact. See core/workflowActionStore.ts.
create table if not exists workflow_actions (
  id           uuid primary key,
  user_email   text not null,
  module       text not null,
  record_key   text not null,
  action       text not null,
  detail       text not null,
  created_at   timestamptz not null default now()
);
create index if not exists workflow_actions_lookup_idx on workflow_actions (user_email, module, record_key, created_at desc);
