import { Pool } from "pg";
import { appConfig } from "../config/app.config";
import { encryptSecret, decryptSecret } from "./credentialVault";

export interface StoredCredentialInfo {
  userEmail: string;
  apiKey: string;
  provisionedBy: string;
  updatedAt: string;
  // apiSecret intentionally never included in list/info responses
}

/**
 * Admin-provisioned, persistent per-user API credentials — the "later
 * we can use that for users on their behalf" store. This is what lets
 * loginWithPassword() skip needing a live ERPNext session cookie once
 * an admin has set one of these up: the stored key becomes the
 * impersonation credential going forward, until revoked.
 */
class UserCredentialStore {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;

  async get(userEmail: string): Promise<{ apiKey: string; apiSecret: string } | null> {
    if (!this.pool) return null;
    const { rows } = await this.pool.query(`select api_key, api_secret_enc from user_credentials where user_email = $1`, [userEmail]);
    if (!rows[0]) return null;
    return { apiKey: rows[0].api_key, apiSecret: decryptSecret(rows[0].api_secret_enc) };
  }

  async list(): Promise<StoredCredentialInfo[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(
      `select user_email, api_key, provisioned_by, updated_at from user_credentials order by user_email`
    );
    return rows.map((r) => ({ userEmail: r.user_email, apiKey: r.api_key, provisionedBy: r.provisioned_by, updatedAt: r.updated_at }));
  }

  async set(userEmail: string, apiKey: string, apiSecret: string, provisionedBy: string): Promise<void> {
    if (!this.pool) throw new Error("Credential store not configured (DATABASE_URL missing)");
    const encrypted = encryptSecret(apiSecret);
    await this.pool.query(
      `insert into user_credentials (user_email, api_key, api_secret_enc, provisioned_by, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (user_email) do update set api_key = $2, api_secret_enc = $3, provisioned_by = $4, updated_at = now()`,
      [userEmail, apiKey, encrypted, provisionedBy]
    );
  }

  async revoke(userEmail: string): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`delete from user_credentials where user_email = $1`, [userEmail]);
  }
}

export const userCredentialStore = new UserCredentialStore();
