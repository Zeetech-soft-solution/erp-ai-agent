-- Per-user settings: email/support-portal/project-plan preferences are
-- PER PERSON, not one org-wide value — a different model from the
-- generic `settings` table (002_settings.sql, 009_settings_groups.sql),
-- which stays for genuinely org-wide knobs (General, Policy documents).
--
-- Two tables, same split as most CMS-style per-user-field systems:
--   user_setting_defs  — the field SCHEMA (one row per field, shared by
--                        every user) — label/type/placeholder/options.
--   user_settings      — the actual VALUES, one row per (user_email, key).
--                        Starts empty; nothing is seeded per-user since
--                        we don't know in advance which users an admin
--                        will configure.
--
-- Same status as the rest of this session's settings work: DEMO/
-- SCAFFOLDING ONLY. Nothing in the backend reads these values, and the
-- admin UI's save button validates then intentionally stops before
-- persisting (see frontend/admin/src/pages/Users.tsx).
create table if not exists user_setting_defs (
  key          text primary key,
  label        text not null,
  description  text,
  value_type   text not null default 'string'
    check (value_type in ('string', 'number', 'boolean', 'password', 'url', 'select')),
  category     text not null default 'general',
  placeholder  text,
  options      jsonb, -- array of strings, for value_type = 'select'
  sort_order   integer not null default 0
);

insert into user_setting_defs (key, label, description, value_type, category, placeholder, options, sort_order) values
  -- ---- Email (per user) ----
  ('email_reply_to', 'Reply-to email', 'Where replies to this user''s outgoing emails should land', 'string', 'email', 'jane@yourcompany.com', null, 1),
  ('email_signature', 'Email signature', null, 'string', 'email', 'Jane Doe, Sales', null, 2),
  ('email_notify_on_reply', 'Notify me on reply', null, 'boolean', 'email', null, null, 3),
  ('email_smtp_username', 'Own SMTP username', 'Only if this person sends through a different mailbox than the org server above', 'string', 'email', 'jane@yourcompany.com', null, 4),
  ('email_smtp_password', 'Own SMTP password', 'Leave blank to keep using the org-wide server and its credentials', 'password', 'email', '••••••••', null, 5),

  -- ---- Support portal (per user) ----
  ('support_ticket_url', 'My support tickets URL', 'Deep link to this user''s assigned tickets view', 'url', 'support', 'https://support.yourcompany.com/agents/jane', null, 1),
  ('support_auto_assign', 'Auto-assign new tickets to me', null, 'boolean', 'support', null, null, 2),
  ('support_notify_channel', 'Notify me via', null, 'select', 'support', null, '["Email", "In-app", "Both", "None"]', 3),

  -- ---- Project planning (per user) ----
  ('projplan_default_project', 'Default project', 'Pre-selected project when this user opens Projects', 'string', 'projplan', 'Q3 Rollout', null, 1),
  ('projplan_notify_on_assignment', 'Notify me when assigned a task', null, 'boolean', 'projplan', null, null, 2),
  ('projplan_view', 'Preferred view', null, 'select', 'projplan', null, '["List", "Board", "Timeline"]', 3),

  -- ---- Policy (per user) ----
  ('policy_acknowledged', 'Has acknowledged current policy', null, 'boolean', 'policy', null, null, 1),
  ('policy_acknowledged_version', 'Acknowledged version', 'Which policy document version this user last confirmed reading', 'string', 'policy', 'v1', null, 2)
on conflict (key) do nothing;

create table if not exists user_settings (
  user_email  text not null,
  key         text not null references user_setting_defs(key),
  value       jsonb not null,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (user_email, key)
);

-- Support and project-planning defaults (009_settings_groups.sql) are
-- superseded by the per-user model above — remove them from the global
-- `settings` table so there's one, unambiguous place for each. Email
-- (SMTP) stays global on purpose: an org has ONE outgoing mail server,
-- not one per person — the per-user email_* fields above (reply-to,
-- signature, notify-on-reply) are individual preferences layered on top
-- of that shared server, not a replacement for it. General and Policy
-- documents also stay global, same reasoning.
delete from settings where category in ('support', 'projplan');
