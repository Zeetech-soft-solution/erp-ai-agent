import { MCPModule, ToolDefinition, EntityConfig } from "./types";
import { systemConnector } from "../config/system.config";
import { RELATIVE_PERIODS } from "./relativePeriods";

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

export function buildEntityModule(config: EntityConfig): MCPModule {
  const ops = config.operations || ["list", "get", "create", "update"];
  const tools: ToolDefinition[] = [];

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
            description:
              `Keys are canonical field names (${config.canonicalFields.join(", ")}). Each value is either ` +
              `the exact value to match (e.g. {"status": "Open"}), or an object {"op": ..., "value": ...} for ` +
              `anything else — op is one of "=", "!=", "like", "in", ">", "<", ">=", "<=", "between", "relative". ` +
              `For a partial/prefix text search use "like" with SQL wildcards, e.g. {"display_name": {"op": ` +
              `"like", "value": "Shree%"}} to find names starting with "Shree", or "%Shree%" to find it anywhere ` +
              `in the name — PREFER "like" over "=" whenever the value came from the user's own short/casual ` +
              `wording (e.g. "IT department") rather than a value you already saw verbatim in a prior tool result, ` +
              `since master-data display names in this system often carry a company-code suffix (the real value ` +
              `behind "IT" can be "IT - SEMPL") that an exact "=" match will silently fail to match at all. ` +
              `For a date field and a phrase like "last week"/"this month"/"yesterday", use "relative" ` +
              `with one of these EXACT values — ${RELATIVE_PERIODS.join(", ")} — e.g. {"date": {"op": "relative", ` +
              `"value": "last_week"}}. Do NOT compute the actual dates yourself even if you're confident you can — ` +
              `always use "relative" for one of these periods; the real date boundaries are resolved for you ` +
              `automatically (Monday-start calendar weeks, not a sliding N-day window) and are more reliable than ` +
              `arithmetic you do yourself. Only fall back to "between" with an explicit [start, end] pair for a ` +
              `range NOT covered by that list (e.g. "since March 3rd", a truly custom range) — one filter key can ` +
              `only carry ONE condition, so ">=" alone or "<=" alone can only ever give you an open-ended half of ` +
              `a range, never a real window. Do NOT use Mongo-style operators like "$like" or "$regex" — they are ` +
              `not supported and will silently match nothing.` +
              (config.fieldValues
                ? " Real values (never guess a different spelling): " +
                  Object.entries(config.fieldValues)
                    .map(([field, values]) => `${field} is one of ${values.map((v) => `"${v}"`).join("/")}`)
                    .join("; ") +
                  ". Several of these are COMBINED states (e.g. \"To Receive and Bill\") that also satisfy a " +
                  "broader concept the user might describe in one word (e.g. \"still awaiting receipt\", \"not " +
                  "yet delivered\") — when the question is a general concept rather than one exact value quoted " +
                  "verbatim, use \"in\" with every real value that concept covers (e.g. [\"To Receive\", \"To " +
                  "Receive and Bill\"]), not just a single \"=\" match on whichever value sounds closest. " +
                  "Confirmed live: \"purchase orders still awaiting receipt\" filtered only {\"status\":\"To " +
                  "Receive\"} and missed real \"To Receive and Bill\" rows that are equally not yet received."
                : "") +
              (config.linkFields
                ? " Fields that are a LINK to another record's real id (never filter these by a person/" +
                  "company's display name — it will silently match nothing): " +
                  Object.entries(config.linkFields)
                    .map(([field, targetEntity]) => `"${field}" must be the real ${targetEntity}.id (e.g. call ` +
                      `${targetEntity}.list first to look it up from a name)`)
                    .join("; ") +
                  "."
                : ""),
          },
          limit: {
            type: "number",
            description:
              "Max rows to return (defaults to a small page, admin-configurable — do not assume 100). Only set " +
              "this higher when the user explicitly asked for more rows or a specific larger number; for an exact " +
              'TOTAL count/sum/etc. across everything matching, use analytics.aggregate instead of raising this.',
          },
          offset: {
            type: "number",
            description:
              'Rows to skip, for paging past the first page — e.g. after an initial call with no limit/offset, ' +
              'a follow-up "show me more"/"next page" becomes the same call again with offset set to the default ' +
              "page size (so the 2nd page starts right after the 1st).",
          },
          sortBy: {
            type: "string",
            description:
              `Canonical field to sort by (one of: ${config.canonicalFields.join(", ")}). Use this for "latest"/` +
              `"most recent"/"oldest" requests instead of guessing at row order — e.g. to find the latest record, ` +
              `sort by its date field with sortDir "desc" and limit 1.`,
          },
          sortDir: { type: "string", enum: ["asc", "desc"], description: 'Sort direction, default "desc" (newest/highest first)' },
        },
      },
      handler: (args, session) =>
        systemConnector.list(config.entityKey, session.credential, normalizeListArgs(args, config.canonicalFields)),
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
    const properties: Record<string, any> = Object.fromEntries((config.createFields || config.canonicalFields).map((f) => [f, {}]));
    if (config.lineItems) {
      const { canonicalField, itemFields, description } = config.lineItems;
      // Confirmed live 2026-08-12: sales_order.create fabricated a
      // "warehouse" value three retries in a row ("Main Warehouse", "FG
      // Warehouse", "Rest Of The World" — the last one is actually a
      // Territory name, not even a warehouse-shaped guess) — none of
      // them real (the real ones in this deployment are e.g. "Stores -
      // SEMPL", "Finished Goods - SEMPL"). itemFields is a flat list of
      // strings with no per-field link metadata (unlike top-level
      // linkFields above), so "warehouse" got zero guidance here even
      // though a warehouse.list tool already exists in this app. Same
      // "never guess, look it up" discipline linkFields already gives
      // top-level fields, applied to this one well-known offender.
      properties[canonicalField] = {
        type: "array",
        description:
          description ||
          `Line items — at least one required. Each item is an object with: ${itemFields.join(", ")}. ` +
          `"rate" is NOT auto-fetched from a price list here — always set it explicitly (look it up via ` +
          `item_price.list first if you don't already know it), or the line — and the whole document's total — ` +
          `will silently price at 0.` +
          (itemFields.includes("warehouse")
            ? ` "warehouse" must be a REAL Warehouse record's id (e.g. "Stores - SEMPL") — NEVER a plausible-` +
              `sounding guess like "Main Warehouse" or "FG Warehouse", which do not exist. Call warehouse.list ` +
              `first if you don't already have the real name from this conversation.`
            : ""),
        items: { type: "object", properties: Object.fromEntries(itemFields.map((f) => [f, {}])) },
      };
    }
    tools.push({
      name: toToolName(config.toolPrefix, "create"),
      description: `Create a new ${config.entityKey} record`,
      module: config.module,
      entityKey: config.entityKey,
      ruleAction: "create",
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
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          // Confirmed live 2026-08-12: quotation.update({fields:
          // {status:"Converted"}}) — a real Frappe validation error, since
          // Quotation's actual status vocabulary is Draft/Open/Replied/
          // Partially Ordered/Ordered/Lost/Cancelled/Expired (no
          // "Converted" — that's Lead/Opportunity's word for the same
          // idea). Root cause: this property had NO description at all,
          // unlike the "list" tool's filters above which already surfaces
          // config.fieldValues as "Real values (never guess a different
          // spelling)" — update just never got the same treatment. Same
          // fix, same data, applied here too.
          fields: {
            type: "object",
            description: config.fieldValues
              ? "Fields to update, keyed by canonical field name. Real values (never guess a different " +
                "spelling): " +
                Object.entries(config.fieldValues)
                  .map(([field, values]) => `${field} is one of ${values.map((v) => `"${v}"`).join("/")}`)
                  .join("; ") +
                "."
              : undefined,
          },
        },
        required: ["id", "fields"],
      },
      handler: (args, session) => systemConnector.update(config.entityKey, session.credential, args.id, args.fields),
    });
  }

  return { name: config.toolPrefix, description: config.description || `${config.entityKey} operations`, tools };
}

export function buildEntityModules(configs: EntityConfig[]): MCPModule[] {
  return configs.map(buildEntityModule);
}
