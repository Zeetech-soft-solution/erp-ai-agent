import { Pool } from "pg";
import { appConfig } from "../config/app.config";
import { encryptSecret, decryptSecret } from "./credentialVault";

export interface SettingRow {
  key: string;
  value: any;
  label: string;
  description: string | null;
  value_type: "string" | "number" | "boolean" | "password" | "url" | "select";
  updated_by: string | null;
  updated_at: string;
}

// Same AES-256-GCM vault already used for stored ERPNext API secrets
// (core/credentialVault.ts, core/userCredentialStore.ts) — applied here
// too so a value_type:'password' setting (llm_api_key, smtp_password)
// isn't sitting in Postgres as plain text just because it lives in a
// generic settings table. Encrypted form is a base64 string, stored
// directly as the jsonb value — no schema change needed.
function encryptForStorage(plaintext: string): string {
  if (!plaintext) return "";
  return encryptSecret(plaintext).toString("base64");
}
function decryptFromStorage(stored: string): string {
  if (!stored) return "";
  try {
    return decryptSecret(Buffer.from(stored, "base64"));
  } catch {
    // Pre-encryption rows (saved before this change) hold plaintext —
    // don't crash on those, just return as-is; they'll re-encrypt
    // correctly the next time this key is saved.
    return stored;
  }
}

/**
 * DB-backed, hot-reloadable OPERATIONAL settings — deliberately separate
 * from app.config.ts, which is env-driven and only re-read on process
 * restart. Anything a non-technical admin should be able to change
 * live belongs here; anything security-sensitive belongs in .env.
 *
 * Small in-memory cache with a short TTL so every reasoning-engine run
 * doesn't hit Postgres for settings on every prompt.
 */
class SettingsService {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;
  private cache: SettingRow[] | null = null;
  private cacheAt = 0;
  private ttlMs = 15000;

  async list(): Promise<SettingRow[]> {
    if (!this.pool) return [];
    if (this.cache && Date.now() - this.cacheAt < this.ttlMs) return this.cache;
    const { rows } = await this.pool.query(`select * from settings order by key`);
    this.cache = rows.map((r) => (r.value_type === "password" && r.value ? { ...r, value: decryptFromStorage(r.value) } : r));
    this.cacheAt = Date.now();
    return this.cache;
  }

  async get<T = any>(key: string, fallback: T): Promise<T> {
    const rows = await this.list();
    const row = rows.find((r) => r.key === key);
    // A row existing is not the same as it holding a real value - migration
    // 012_llm_and_erp_settings.sql seeds llm_base_url/llm_api_key as "" by
    // design (placeholder until an admin fills them in), and the old
    // `row ? row.value : fallback` treated that seeded blank the same as a
    // real admin-set value, permanently shadowing the correct .env fallback
    // on every fresh deploy until someone manually retyped it into the
    // admin UI. Confirmed live 2026-08-07: this broke OpenAI calls with
    // "Invalid URL" (empty llm_base_url) on a fresh install that had a
    // perfectly valid LLM_API_KEY/LLM_BASE_URL in .env the whole time.
    if (!row || row.value === "" || row.value === null || row.value === undefined) return fallback;
    return row.value as T;
  }

  async update(key: string, value: any, adminUser: string): Promise<SettingRow> {
    if (!this.pool) throw new Error("Settings store not configured (DATABASE_URL missing)");
    const before = await this.pool.query(`select * from settings where key = $1`, [key]);
    if (!before.rows[0]) throw new Error(`Unknown setting: ${key}`);

    const storedValue = before.rows[0].value_type === "password" ? encryptForStorage(String(value)) : value;

    const { rows } = await this.pool.query(
      `update settings set value = $1, updated_by = $2, updated_at = now() where key = $3 returning *`,
      [JSON.stringify(storedValue), adminUser, key]
    );

    await this.pool.query(
      // Never write a real secret into the audit trail's before/after —
      // log that a password-type value changed, not what it changed to/from.
      `insert into admin_audit_log (admin_user, action, target, before, after) values ($1,$2,$3,$4,$5)`,
      [
        adminUser,
        "update_setting",
        key,
        before.rows[0].value_type === "password" ? '"[redacted]"' : JSON.stringify(before.rows[0].value),
        before.rows[0].value_type === "password" ? '"[redacted]"' : JSON.stringify(value),
      ]
    );

    this.cache = null; // invalidate
    return before.rows[0].value_type === "password" ? { ...rows[0], value } : rows[0];
  }
}

export const settingsService = new SettingsService();
