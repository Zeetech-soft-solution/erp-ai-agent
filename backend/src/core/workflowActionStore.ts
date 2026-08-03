import { randomUUID } from "crypto";
import { Pool } from "pg";
import { appConfig } from "../config/app.config";

export interface WorkflowAction {
  id: string;
  module: string;
  recordKey: string;
  action: string;
  detail: string;
  createdAt: string;
}

/**
 * Durable log of "confirmed in chat, now really happened" actions that
 * aren't email (see core/sentEmailStore.ts for that one) - a support
 * ticket resolution, a project issue comment. Same replayable-query
 * discipline as alertStore.ts/sentEmailStore.ts: nothing consumed by
 * reading it, so a tab's poll and a fresh page load see the same data.
 */
class WorkflowActionStore {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;

  async push(userEmail: string, entry: { module: string; recordKey: string; action: string; detail: string }): Promise<WorkflowAction> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    if (this.pool) {
      await this.pool.query(
        `insert into workflow_actions (id, user_email, module, record_key, action, detail, created_at) values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, userEmail, entry.module, entry.recordKey, entry.action, entry.detail, createdAt]
      );
    }
    return { id, ...entry, createdAt };
  }

  async list(userEmail: string, module?: string, limit = 100): Promise<WorkflowAction[]> {
    if (!this.pool) return [];
    const { rows } = module
      ? await this.pool.query(
          `select id, module, record_key as "recordKey", action, detail, created_at as "createdAt"
           from workflow_actions where user_email = $1 and module = $2
           order by created_at desc limit $3`,
          [userEmail, module, limit]
        )
      : await this.pool.query(
          `select id, module, record_key as "recordKey", action, detail, created_at as "createdAt"
           from workflow_actions where user_email = $1
           order by created_at desc limit $2`,
          [userEmail, limit]
        );
    return rows;
  }
}

export const workflowActionStore = new WorkflowActionStore();
