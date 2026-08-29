import { Pool } from "pg";
import { RuleViolation } from "./types";
import { appConfig } from "../config/app.config";

export interface RuleOutcomeRecord {
  entity_key: string;
  action: "create" | "update";
  actor_email: string;
  allowed: boolean;
  violations: RuleViolation[];
  args: Record<string, any>;
  created_at: string;
}

/**
 * Every business-rule evaluation (see core/businessRuleEngine.ts) is
 * logged here — this is the "local database asset" for improving
 * business-rule/contextual-decision accuracy later: which rules fire,
 * how often they block vs. warn, and on what actual arguments. Same
 * safe-no-op-without-DATABASE_URL discipline as interactionLogger.ts.
 */
export class PostgresRuleOutcomeLogger {
  private pool: Pool | null = appConfig.db.postgresUrl ? new Pool({ connectionString: appConfig.db.postgresUrl }) : null;

  async log(record: RuleOutcomeRecord): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `insert into rule_evaluations
        (entity_key, action, actor_email, allowed, violations, args, created_at)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        record.entity_key,
        record.action,
        record.actor_email,
        record.allowed,
        JSON.stringify(record.violations),
        JSON.stringify(record.args),
        record.created_at,
      ]
    );
  }
}

export const ruleOutcomeLogger = new PostgresRuleOutcomeLogger();
