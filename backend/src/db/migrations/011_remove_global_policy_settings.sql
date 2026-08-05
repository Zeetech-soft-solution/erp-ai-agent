-- Policy settings don't belong in Global Settings at all — the actual
-- Policy Documents page (upload form + module dropdown + uploaded-docs
-- table) is the right place for anything policy-related, and it
-- doesn't need a separate "default module" concept. Remove the two
-- policy_* rows seeded in 009_settings_groups.sql.
delete from settings where category = 'policy';
