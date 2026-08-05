-- Two additions to the General category:
--
-- 1. LLM provider/key/base-URL — llm_model and llm_max_tool_iterations
--    already existed (009_settings_groups.sql); these three complete
--    the set so the whole LLM call site can be DB-driven (see
--    providers/llm/openaiProvider.ts). llm_api_key is value_type
--    'password', which settingsService.ts now encrypts at rest with
--    the same AES-256-GCM vault already used for ERPNext credentials —
--    never stored as plain text, unlike a plain .env value.
--
-- 2. erp_supports_api_key_generation — some connected systems (ERPNext)
--    let a user self-generate their own API key/secret; some don't.
--    When true, the admin console's manual "provision a credential"
--    form should be disabled — the real key lives on the connected
--    system's own user profile, not typed in here. When false, the
--    manual form is the only way, same as today.
insert into settings (key, value, label, description, value_type, category, placeholder, options) values
  ('llm_provider', '"OpenAI"', 'LLM provider', 'Which brand of model this deployment calls', 'select', 'general', null,
    '["OpenAI", "Anthropic", "Google", "Mistral", "Azure OpenAI", "Groq", "Other"]'),
  ('llm_base_url', '""', 'LLM API base URL', 'Must match the selected provider, e.g. https://api.openai.com/v1', 'url', 'general', 'https://api.openai.com/v1', null),
  ('llm_api_key', '""', 'LLM API key', 'Encrypted at rest — same vault used for stored ERPNext credentials', 'password', 'general', '••••••••', null),
  ('erp_supports_api_key_generation', 'true', 'Connected ERP generates its own API keys', 'When on, disables manual key provisioning below — the real key lives on that system''s user profile instead', 'boolean', 'general', null, null)
on conflict (key) do nothing;
