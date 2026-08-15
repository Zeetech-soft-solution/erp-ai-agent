-- Makes core/conversationStore.ts's feature admin-controllable instead of
-- a code/env-only flag (appConfig.chatHistoryEnabled was the first cut —
-- see its own doc comment in config/app.config.ts for why it defaults
-- OFF). Same DB-driven, hot-reloadable pattern settingsService.ts already
-- uses for llm_model/llm_base_url etc. — an admin can flip this on for a
-- real go-live with no redeploy, and dial the "last N days" default
-- shown in the chat sidebar without touching code either.
--
-- Read from three places: agent.routes.ts (gates conversationStore calls
-- + the /conversations* routes, and feeds chat_history_window_days into
-- listRecent's default), and GET /capabilities (surfaces both to the
-- frontend, which has no other safe way to read admin settings — Chat.tsx
-- renders the sidebar only when chat_history_enabled comes back true).
insert into settings (key, value, label, description, value_type, category, placeholder, options) values
  ('chat_history_enabled', 'false', 'Persistent chat history', 'Save chat threads so users can browse back to past conversations (sidebar in the chat UI). Off by default — the underlying tables/routes are ready, this just controls whether it''s live for users.', 'boolean', 'general', null, null),
  ('chat_history_window_days', '3', 'Chat history default window (days)', 'How many days of recent threads load by default in the sidebar before a user has to click "View older"', 'number', 'general', '3', null)
on conflict (key) do nothing;
