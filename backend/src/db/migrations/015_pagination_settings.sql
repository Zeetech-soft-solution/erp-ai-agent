-- Makes the *.list default page size an admin-controllable knob instead of
-- a hardcoded constant (erpnextConnector.ts's list() used a flat 100 —
-- well above Frappe's own native default of 20, and a lot of token-heavy
-- field data to hand the LLM on a plain "show me X" ask when most of it
-- never gets read past the first handful of rows). Same DB-driven,
-- hot-reloadable pattern settingsService.ts already uses for
-- chat_history_window_days etc. — an admin can dial this without a
-- redeploy. Seeded to 25 per explicit product decision 2026-08-17. Read
-- from erpnextConnector.ts's list() only — a caller (or the model, via a
-- follow-up "show me more") can still explicitly ask for a bigger page via
-- the existing limit/offset params, this only changes the UNREQUESTED
-- default.
insert into settings (key, value, label, description, value_type, category, placeholder, options) values
  ('list_page_size', '25', 'Rows per page (default)', 'How many rows a list request returns by default when nothing more specific is asked for. Lower keeps replies fast and token-light; a user can still ask to see more.', 'number', 'general', '25', null)
on conflict (key) do nothing;
