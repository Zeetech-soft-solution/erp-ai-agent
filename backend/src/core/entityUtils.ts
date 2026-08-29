import { ENTITY_ALIASES, ENTITY_CONFIGS } from "../config/entities.config";
import { EntityConfig } from "./types";

/**
 * ONE home for "what entity / what field did the model actually mean".
 *
 * The model, generating execute_query / analytics.aggregate / search_schema
 * arguments mid-turn, reaches for names that aren't the canonical ones:
 *   - entityKey "invoice" (real: sales_invoice), "bill", "po", plurals
 *   - groupBy "customer_id" / SQL-style "sales_invoice.customer_id"
 *     (real: the bare canonical field "customer")
 * Confirmed live (interaction_log, "every customer's overdue + paid/unpaid
 * invoice counts"): each "Unknown entity" / unknown-field failure made the
 * model abandon the query and punt the whole request to a PDF report
 * instead of retrying with a real name.
 *
 * Every repair here is deterministic and lossless on an already-correct
 * call — a real entityKey and a bare field name pass through untouched —
 * so it only ever quietly fixes the wrong guess, never changes a right one.
 *
 * The set of REAL entity keys is DERIVED from ENTITY_CONFIGS (all ~78
 * today, every one added across the planned 60+ modules automatically) —
 * never a hand-maintained list.
 */
const REAL_ENTITY_KEYS = new Set(ENTITY_CONFIGS.map((c) => c.entityKey));

export class EntityUtils {
  /** All real entityKeys, derived from ENTITY_CONFIGS. Read-only view. */
  static realEntityKeys(): ReadonlySet<string> {
    return REAL_ENTITY_KEYS;
  }

  /**
   * Canonical entityKey for whatever the model passed. A real key passes
   * through unchanged; a known alias ("invoice" -> "sales_invoice")
   * resolves to its target; anything else is returned as-is so the
   * caller's own "unknown entity" error still fires (with its hint).
   */
  static resolveEntityKey(key: string): string {
    if (!key || typeof key !== "string") return key;
    if (REAL_ENTITY_KEYS.has(key)) return key;
    const normalized = key.trim().toLowerCase();
    if (REAL_ENTITY_KEYS.has(normalized)) return normalized;
    return ENTITY_ALIASES[normalized] || key;
  }

  /**
   * Drop a SQL-style table qualifier from a field name:
   * "sales_invoice.customer" -> "customer" (any depth). A real canonical
   * field never contains a ".", so this is a safe no-op on a correct
   * call. Used for every field position in an execute_query call.
   */
  static stripDottedPrefix(name: string): string {
    if (!name || typeof name !== "string") return name;
    const idx = name.lastIndexOf(".");
    return idx === -1 ? name : name.slice(idx + 1);
  }

  /**
   * Bare canonical field name for a groupBy / join key: stripDottedPrefix
   * plus a trailing "_id" ("customer_id" -> "customer"). No canonical
   * field in this app ends in "_id" (the identity field is literally
   * "id", links are the bare entity word), so both strips are safe
   * no-ops on a correct call. Deliberately does NOT run the result
   * through resolveEntityKey — a field is not an entity.
   */
  static stripFieldQualifiers(name: string): string {
    if (!name || typeof name !== "string") return name;
    const bare = EntityUtils.stripDottedPrefix(name);
    return bare.length > 3 && bare.endsWith("_id") ? bare.slice(0, -3) : bare;
  }

  /** True if `key` (after alias resolution) is a real registered entity. */
  static isValidEntity(key: string): boolean {
    return REAL_ENTITY_KEYS.has(EntityUtils.resolveEntityKey(key));
  }

  /** The EntityConfig for `key` (alias-resolved), or undefined. */
  static getEntityConfig(key: string): EntityConfig | undefined {
    const resolved = EntityUtils.resolveEntityKey(key);
    return ENTITY_CONFIGS.find((c) => c.entityKey === resolved);
  }
}

// Convenience free functions — same call the existing sites already use,
// so nothing downstream has to know EntityUtils exists.
export const resolveEntityKey = (key: string): string => EntityUtils.resolveEntityKey(key);
export const stripDottedPrefix = (name: string): string => EntityUtils.stripDottedPrefix(name);
export const stripFieldQualifiers = (name: string): string => EntityUtils.stripFieldQualifiers(name);
