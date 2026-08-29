-- Admin-provisioned, per-user ERPNext (or any active SystemConnector's)
-- API credentials. Unlike `settings`, this table holds real secrets —
-- api_secret is stored ENCRYPTED (see core/credentialVault.ts), never
-- plaintext. api_key is not secret on its own (ERPNext API keys are
-- meant to be paired with a secret to be usable), kept plaintext for
-- lookup/display purposes only.
create table if not exists user_credentials (
  user_email      text primary key,
  api_key         text not null,
  api_secret_enc  bytea not null,   -- AES-256-GCM: 12-byte iv || 16-byte tag || ciphertext
  provisioned_by  text not null,     -- admin who set this
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
