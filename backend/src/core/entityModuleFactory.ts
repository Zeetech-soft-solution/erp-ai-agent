import { MCPModule, ToolDefinition, EntityConfig } from "./types";
import { systemConnector } from "../config/system.config";
import { WRITE_OPERATIONS } from "../systemPrompt/core/writeOperations";

/**
 * Generates list/get/create/update tools for any canonical entity,
 * calling ONLY through systemConnector — never a specific ERP's client.
 * Every call passes session.credential, so the resulting ERPNext (or
 * SAP) record is created/modified AS the actual logged-in person, not
 * the agent's own service account — see core/types.ts UserCredential.
 *
 * create/update tools are always tagged with entityKey/ruleAction (see
 * ToolDefinition, core/gateway.ts) so ANY entity gets business-rule
 * enforcement for free the moment its module's rules.ts registers a
 * RuleSet for it — no per-tool opt-in to remember as coverage grows.
 * Entities with no registered rules (most of them, today) pay a no-op
 * check: businessRuleEngine.evaluate() returns allowed:true when
 * nothing is registered for that entityKey.
 *
 * 2026-08-23, explicit user request: compacted every generated
 * description down to real fields + real enum values (JSON schema
 * `enum`, not a prose sentence listing them) — same real data as
 * before (config.fieldValues/linkFields/canonicalFields), just no
 * longer re-explained in paragraph form on every single entity's own
 * schema. The filter-operator syntax (=, !=, like, in, between,
 * relative, >/</>=/<=) and the RELATIVE_PERIODS vocabulary are NOT
 * repeated here anymore — both are already centrally taught, always-on,
 * in CRITICAL_PRINCIPLES/DATA_QUERY_DISCIPLINE (systemPrompt/core/), so
 * repeating them per-entity was pure duplication, not a second source
 * of truth. All real HANDLER logic (normalizeListArgs, requireFilters
 * gate, lineItems mechanics, businessRuleEngine tagging) is completely
 * untouched — only the schema/description text generation changed.
 */
function toToolName(prefix: string, action: string) {
  return `${prefix}.${action}`;
}

/**
 * Confirmed live 2026-08-11: "overdue tasks" sent {"status":"Overdue"} as
 * a TOP-LEVEL argument instead of properly nested under "filters" — the
 * only real filter parameter this tool's own JSON schema declares. Since
 * there's no top-level "status" property in that schema, it was silently
 * ignored: systemConnector.list() received filters:undefined, returned
 * an unfiltered default-sorted page, and the model's own prose then
 * mislabeled those (genuinely "Completed") rows as "overdue" without
 * checking their real status field. Forgiving normalization: any
 * top-level arg whose key matches a real canonical field name gets
 * folded into filters before the call — a malformed-but-clearly-
 * intentional request still does the right thing instead of silently
 * doing nothing. Real `filters` values win on a key collision (a
 * properly-shaped filters object is the more deliberate, trustworthy
 * signal); this never removes anything, only recovers what would
 * otherwise be lost.
 */
export function normalizeListArgs(args: any, canonicalFields: string[]) {
  const KNOWN_TOP_LEVEL = new Set(["filters", "limit", "offset", "sortBy", "sortDir"]);
  const strayFilters: Record<string, any> = {};
  for (const [key, value] of Object.entries(args || {})) {
    if (KNOWN_TOP_LEVEL.has(key) || !canonicalFields.includes(key)) continue;
    strayFilters[key] = value;
  }
  const filters = Object.keys(strayFilters).length ? { ...strayFilters, ...(args?.filters || {}) } : args?.filters;
  return { filters, limit: args?.limit, offset: args?.offset, sortBy: args?.sortBy, sortDir: args?.sortDir };
}

// One property per real canonical field — real enum (config.fieldValues)
// or a short "real <entity>.id" note (config.linkFields) where either
// applies, no "type" forced otherwise (same permissive shape create's
// own field properties already used) so the {op,value} operator form
// still passes through untouched — this deployment doesn't use OpenAI's
// strict-schema mode, so `enum` guides the model without hard-blocking
// the operator-object shape either.
function buildFieldProperties(config: EntityConfig): Record<string, any> {
  return Object.fromEntries(
    config.canonicalFields.map((field) => {
      if (config.fieldValues?.[field]) return [field, { enum: config.fieldValues[field] }];
      if (config.linkFields?.[field]) return [field, { description: `real ${config.linkFields[field]}.id` }];
      return [field, {}];
    })
  );
}

export function buildEntityModule(config: EntityConfig): MCPModule {
  const ops = config.operations || ["list", "get", "create", "update"];
  const tools: ToolDefinition[] = [];
  const fieldProperties = buildFieldProperties(config);

  if (ops.includes("list")) {
    tools.push({
      name: toToolName(config.toolPrefix, "list"),
      description: `List ${config.entityKey} records${config.description ? " — " + config.description : ""}`,
      module: config.module,
      parameters: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            description: "Real field = exact value, or {op,value} for like/in/between/relative/comparisons.",
            properties: fieldProperties,
          },
          limit: { type: "number", description: "Max rows (default: a small page). Pass the exact number if the user stated one." },
          offset: { type: "number", description: "Rows to skip, for a next page." },
          sortBy: { type: "string", enum: config.canonicalFields, description: "Set for any latest/newest/top-N request." },
          sortDir: { type: "string", enum: ["asc", "desc"], description: "Default desc." },
        },
      },
      handler: (args, session) => {
        const normalized = normalizeListArgs(args, config.canonicalFields);
        // Real, explicit safety gate (see EntityConfig.requireFilters's
        // own doc comment) — a bare, unfiltered .list against an entity
        // like communication (a person's own email inbox) should never
        // silently return everything just because the model forgot or
        // didn't bother to narrow it. Returns an empty result WITHOUT
        // ever reaching the real connector — same shape a genuinely
        // empty search would return, so this reads as "no matches" to
        // the model, not an error, and costs nothing extra.
        if (config.requireFilters && (!normalized.filters || Object.keys(normalized.filters).length === 0)) {
          return Promise.resolve([]);
        }
        // 2026-08-23, explicit user request: "in query execution of 20
        // rows u already know how many rows ... what makes to ask llm" —
        // real point, real fix. A cheap, real, zero-row-fetch total
        // (systemConnector.count(), Frappe's own get_count) runs
        // alongside the actual row fetch, same filters, one real round
        // trip pair instead of ever needing the model to ask "is there
        // more" and guess an offset for a follow-up. Attached as a
        // non-index property on the returned array (rows.totalCount) —
        // deliberately NOT changing the return shape from a bare array,
        // so the render path and every existing caller that expects
        // Array.isArray(result) keeps working completely unchanged;
        // stripGroupsForContext (this file's own strip-for-LLM-context
        // logic) reads it off the same array to report the REAL total
        // instead of a hasMore-only guess.
        return Promise.all([systemConnector.list(config.entityKey, session.credential, normalized), systemConnector.count(config.entityKey, session.credential, normalized.filters)]).then(
          ([rows, totalCount]) => Object.assign(rows, { totalCount })
        );
      },
    });
  }

  if (ops.includes("get")) {
    tools.push({
      name: toToolName(config.toolPrefix, "get"),
      description: `Get a single ${config.entityKey} record by id`,
      module: config.module,
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      handler: (args, session) => systemConnector.get(config.entityKey, session.credential, args.id),
    });
  }

  if (ops.includes("create")) {
    const createFieldNames = config.createFields || config.canonicalFields;
    const properties: Record<string, any> = Object.fromEntries(createFieldNames.map((f) => [f, fieldProperties[f] || {}]));
    if (config.lineItems) {
      const { canonicalField, itemFields, description } = config.lineItems;
      // Confirmed live 2026-08-12: sales_order.create fabricated a
      // "warehouse" value three retries in a row — none real. Kept as a
      // short, targeted note (not the original full essay) since it's a
      // real, confirmed-live failure mode, not generic advice.
      properties[canonicalField] = {
        type: "array",
        description:
          description ||
          `Line items, at least one required: ${itemFields.join(", ")}. Set "rate" explicitly (look it up via ` +
            `item_price.list, never 0).` +
            (itemFields.includes("warehouse") ? ` "warehouse" must be a real warehouse.list id, never a guessed name.` : ""),
        items: { type: "object", properties: Object.fromEntries(itemFields.map((f) => [f, {}])) },
      };
    }
    tools.push({
      name: toToolName(config.toolPrefix, "create"),
      description: `Create a new ${config.entityKey} record`,
      module: config.module,
      entityKey: config.entityKey,
      ruleAction: "create",
      promptRules: [WRITE_OPERATIONS],
      parameters: { type: "object", properties },
      handler: (args, session) => systemConnector.create(config.entityKey, session.credential, args),
    });
  }

  if (ops.includes("update")) {
    tools.push({
      name: toToolName(config.toolPrefix, "update"),
      description: `Update fields on an existing ${config.entityKey} record`,
      module: config.module,
      entityKey: config.entityKey,
      ruleAction: "update",
      promptRules: [WRITE_OPERATIONS],
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          fields: {
            type: "object",
            description: "Fields to update, keyed by canonical field name.",
            properties: fieldProperties,
          },
        },
        required: ["id", "fields"],
      },
      handler: (args, session) => systemConnector.update(config.entityKey, session.credential, args.id, args.fields),
    });
  }

  // 2026-08-23, explicit user request: real document submission
  // (Draft -> Submitted) — opt-in only (never in the default operations
  // list above), since most entities aren't ERPNext-submittable
  // doctypes at all. ruleAction:"update" (not a new "submit" value) —
  // submission is itself a mutation on an existing record, so any real
  // update rule already registered for this entity should apply to it
  // too; RuleSet's own rule.action type stays create|update, unchanged.
  if (ops.includes("submit")) {
    tools.push({
      name: toToolName(config.toolPrefix, "submit"),
      description: `Submit a ${config.entityKey} record (Draft -> Submitted) — irreversible, confirm with the user first.`,
      module: config.module,
      entityKey: config.entityKey,
      ruleAction: "update",
      promptRules: [WRITE_OPERATIONS],
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      handler: (args, session) => systemConnector.submit(config.entityKey, session.credential, args.id),
    });
  }

  return { name: config.toolPrefix, description: config.description || `${config.entityKey} operations`, tools };
}

export function buildEntityModules(configs: EntityConfig[]): MCPModule[] {
  return configs.map(buildEntityModule);
}
