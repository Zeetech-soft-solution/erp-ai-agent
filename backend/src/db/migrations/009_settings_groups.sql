-- Extends the existing generic `settings` table (002_settings.sql) with
-- grouping and richer input hints, so the admin UI can render sensible
-- controls (select/url/password) and organize settings into sections,
-- without needing a schema change every time a new group is added.
--
-- These new rows are DEMO/SCAFFOLDING ONLY as of this migration: nothing
-- in the backend reads smtp_*, support_*, projplan_*, or policy_* yet.
-- They exist so an admin can enter and save real values ahead of the
-- actual email/support/project-plan integrations being wired up to read
-- them later. jwt_expires_in and context_session_turns are the same,
-- surfaced but not yet consumed by auth/jwt.ts or the context provider.
alter table settings add column if not exists category text not null default 'general';
alter table settings add column if not exists placeholder text;
alter table settings add column if not exists options jsonb; -- array of strings, for value_type = 'select'

alter table settings drop constraint if exists settings_value_type_check;
alter table settings add constraint settings_value_type_check
  check (value_type in ('string', 'number', 'boolean', 'password', 'url', 'select'));

update settings set category = 'general' where category is null;

insert into settings (key, value, label, description, value_type, category, placeholder, options) values
  -- ---- General (additions to the existing operational group) ----
  ('jwt_expires_in', '"8h"', 'Session expiry', 'How long a signed-in session stays valid before requiring login again', 'string', 'general', '8h', null),
  ('context_session_turns', '6', 'Conversation memory (turns)', 'How many recent turns of a chat session are kept as context', 'number', 'general', '6', null),

  -- ---- Email (SMTP) ----
  ('smtp_host', '""', 'SMTP host', 'Outgoing mail server address', 'string', 'email', 'smtp.gmail.com', null),
  ('smtp_port', '587', 'SMTP port', null, 'number', 'email', '587', null),
  ('smtp_encryption', '"TLS"', 'Encryption', null, 'select', 'email', null, '["None", "SSL", "TLS"]'),
  ('smtp_username', '""', 'SMTP username', null, 'string', 'email', 'notifications@yourcompany.com', null),
  ('smtp_password', '""', 'SMTP password', null, 'password', 'email', '••••••••', null),
  ('smtp_from_name', '""', 'From name', 'Display name on outgoing emails', 'string', 'email', 'Zyte ERP Agent', null),
  ('smtp_from_email', '""', 'From email', null, 'string', 'email', 'no-reply@yourcompany.com', null),

  -- ---- Support portal ----
  ('support_portal_url', '""', 'Support portal URL', null, 'url', 'support', 'https://support.yourcompany.com', null),
  ('support_email', '""', 'Support inbox email', 'Where new support tickets get copied', 'string', 'support', 'support@yourcompany.com', null),
  ('support_default_team', '"Tier 1"', 'Default routing team', 'Which team new tickets are assigned to before triage', 'select', 'support', null, '["Tier 1", "Tier 2", "Escalations"]'),
  ('support_sla_hours', '24', 'Default SLA (hours)', 'Target first-response time for a new ticket', 'number', 'support', '24', null),

  -- ---- Project planning ----
  ('projplan_default_view', '"List"', 'Default project view', null, 'select', 'projplan', null, '["List", "Board", "Timeline"]'),
  ('projplan_sprint_length_days', '14', 'Sprint length (days)', null, 'number', 'projplan', '14', null),
  ('projplan_default_priority', '"Medium"', 'Default task priority', null, 'select', 'projplan', null, '["Low", "Medium", "High"]'),
  ('projplan_notify_on_overdue', 'true', 'Notify on overdue tasks', null, 'boolean', 'projplan', null, null),

  -- ---- Policy documents ----
  ('policy_default_module', '""', 'Default module for new uploads', 'Pre-selected module on the Policy Documents upload form', 'select', 'policy', null,
    '["crm", "selling", "buying", "stock", "accounting", "hr", "manufacturing", "projects", "assets", "quality"]'),
  ('policy_require_ack', 'false', 'Require acknowledgment before first use', 'Not enforced yet', 'boolean', 'policy', null, null)
on conflict (key) do nothing;

-- Tag the existing seed rows from 002_settings.sql with their category
-- so they group correctly in the admin UI (they predate this column).
update settings set category = 'general' where key in
  ('org_display_name', 'maintenance_mode', 'llm_model', 'llm_max_tool_iterations', 'context_budget_chars', 'context_vector_topk');
