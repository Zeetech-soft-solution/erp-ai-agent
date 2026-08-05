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
 * user_email + key). Same status as the rest of this settings work:
 * read-only from here, nothing writes through this service yet — the
 * admin UI's save button stops before ever calling a write endpoint.
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
}

export const userSettingsService = new UserSettingsService();
