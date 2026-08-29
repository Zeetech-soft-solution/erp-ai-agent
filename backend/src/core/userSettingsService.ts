import { Pool } from "pg";
import { appConfig } from "../config/app.config";

export interface UserSettingDef {
  key: string;
  label: string;
  description: string | null;
  value_type: "string" | "number" | "boolean" | "password" | "url" | "select";
  category: string;
  placeholder: string | null;
  options: string[] | null;
  sort_order: number;
}

export interface UserSettingValue {
  key: string;
  value: any;
  updated_by: string | null;
  updated_at: string;
}

/**
 * Per-USER preferences (email/support/project-plan/policy), a different
 * model from settingsService.ts's org-wide settings — see
 * db/migrations/010_user_settings.sql for why these split into two
 * tables (defs are shared field schema, values are one row per
 * user_email + key). Writes go through `update()` for real now — see
 * routes/admin.routes.ts for who's allowed to call it (the
 * demo.admin@local session is blocked there, before it ever reaches
 * this class).
 */
class UserSettingsService {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;

  async listDefs(): Promise<UserSettingDef[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(`select * from user_setting_defs order by category, sort_order`);
    return rows;
  }

  async listForUser(userEmail: string): Promise<UserSettingValue[]> {
    if (!this.pool) return [];
    const { rows } = await this.pool.query(`select key, value, updated_by, updated_at from user_settings where user_email = $1`, [
      userEmail,
    ]);
    return rows;
  }

  /** Reads one value with a fallback — the shape agent-app code will use
   *  once a specific field (email_reply_to, support_ticket_url, ...) is
   *  actually wired into real behavior, same pattern as
   *  settingsService.get(). Falls back to the def's own value_type
   *  default (never throws just because a user hasn't set this yet). */
  async get<T = any>(userEmail: string, key: string, fallback: T): Promise<T> {
    if (!this.pool) return fallback;
    const { rows } = await this.pool.query(`select value from user_settings where user_email = $1 and key = $2`, [userEmail, key]);
    return rows[0] ? (rows[0].value as T) : fallback;
  }

  async update(userEmail: string, key: string, value: any, adminUser: string): Promise<UserSettingValue> {
    if (!this.pool) throw new Error("Settings store not configured (DATABASE_URL missing)");
    const def = await this.pool.query(`select 1 from user_setting_defs where key = $1`, [key]);
    if (!def.rows[0]) throw new Error(`Unknown per-user setting: ${key}`);

    const { rows } = await this.pool.query(
      `insert into user_settings (user_email, key, value, updated_by, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (user_email, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
       returning key, value, updated_by, updated_at`,
      [userEmail, key, JSON.stringify(value), adminUser]
    );

    await this.pool.query(
      `insert into admin_audit_log (admin_user, action, target, before, after) values ($1,$2,$3,$4,$5)`,
      [adminUser, "update_user_setting", `${userEmail}:${key}`, null, JSON.stringify(value)]
    );

    return rows[0];
  }
}

export const userSettingsService = new UserSettingsService();
