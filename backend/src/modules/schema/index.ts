import { MCPModule } from "../../core/types";
import { ENTITY_CONFIGS } from "../../config/entities.config";
import { resolveEntityKey } from "../../core/entityUtils";
import { DATA_QUERY_DISCIPLINE } from "../../systemPrompt/core/dataQueryDiscipline";

/**
 * Real, explicit product ask (2026-08-20): "rename schema_search...
 * then each table will have schema, by get the table — there will be
 * two calls: one is list tables, second is get schema by table" — the
 * standard database-introspection split (SQL's own SHOW TABLES /
 * DESCRIBE <table>, the same two-tool shape most real DB-query MCP
 * servers use) replaces the old single schema.search(entityKey|query)
 * tool. data_table.list answers "what tables exist"; data_table.search_schema
 * answers "what does THIS one table look like" — a clean two-step flow
 * instead of one tool doing both an optional browse and an optional
 * lookup depending on which argument was passed.
 *
 * Deliberately NOT a raw SQL/db.sql() passthrough — the user's own
 * diagram described a "query generator" feeding a database query, but
 * handing an LLM a literal SQL string bypasses ERPNext's own DocPerm
 * row/field permission model entirely (frappe.db.sql runs as whatever
 * DB user the process itself has, not "as this logged-in person" the
 * way frappe.get_list/get_doc do) and opens a real SQL-injection surface
 * the moment any of that string is built from user-influenced text. Both
 * tools here stay read-only, in-process metadata (zero ERPNext round
 * trip — ENTITY_CONFIGS is already loaded), and the actual DATA fetch
 * always still goes through the same permission-respecting typed tools
 * (data_server.run, <entity>.list) every other real query in this app
 * already uses — this is the safe "what CAN I query" layer, not a new
 * way to query.
 */
export interface TableInfo {
  tableName: string;
  description?: string;
}

export function listTables(): { tables: TableInfo[] } {
  return {
    tables: ENTITY_CONFIGS.map((c) => (c.description ? { tableName: c.entityKey, description: c.description } : { tableName: c.entityKey })),
  };
}

// Real, explicit product ask (2026-08-20): "schema is just string...
// llm know what it is" — plain CREATE-TABLE-shaped text, the same
// notation the model already writes fluent, correct SQL in unprompted
// (confirmed live: asked directly for "just the query," it produced
// exact real JOIN/GROUP BY/CASE WHEN SQL against this exact schema on
// the first try). A plain string can't be mistaken for a page of a
// paginated list either, unlike the old {results:[...]} JSON envelope
// this replaced — confirmed live, that old shape got called 3 times in
// a row for the identical entity, the model seemingly re-probing for
// "more" the way it legitimately would for a real list.
// Real, live-found bug (2026-08-23/24): the old "field -> entity.id"
// notation (e.g. "customer -> customer.id") was meant to describe a
// LINK relationship, but read exactly like a literal dotted field name
// — confirmed live: a real join call used leftKey:"customer.id" and
// rightKey:"sales_invoice.customer" (every field SQL-prefixed with its
// own table name), when execute_query's real join/filters/groupBy have
// never accepted dotted names, only bare canonical ones. The query
// silently matched zero rows (no error — the mismatched keys just never
// existed on any row) and the model reported a false "no records"
// negative. Spelled out explicitly now: which bare field name IS the
// real leftKey, and that a linked entity's own id is always its own
// bare "id" field (every entity's own schema block already shows this).
function toSchemaText(c: (typeof ENTITY_CONFIGS)[number]): string {
  const columns = c.canonicalFields.map((f) => {
    if (c.linkFields?.[f]) return `${f} (links to ${c.linkFields[f]}'s own "id" — join leftKey:"${f}" rightKey:"id")`;
    if (c.fieldValues?.[f]?.length) return `${f} (${c.fieldValues[f].join(", ")})`;
    return f;
  });
  let text = `TABLE ${c.entityKey} (${columns.join(", ")})`;
  if (c.description) text += `\n-- ${c.description}`;
  return text;
}

/** Shared by the local engine's normal handler dispatch and the relay's
 *  own in-process branch (same "no ERPNext round trip, no session-
 *  specific access boundary of its own" reasoning tools.search's
 *  searchTools() already documents — this is pure, already-loaded
 *  config, identical regardless of who's asking). */
export function getTableSchema(args: { tableName?: string; query?: string }): { schema: string } {
  const tableName = resolveEntityKey((args.tableName || "").trim().toLowerCase());
  if (tableName) {
    const matched = ENTITY_CONFIGS.find((c) => c.entityKey === tableName);
    if (!matched) {
      return { schema: `No table named "${args.tableName}" — try "query" with a keyword to find the real one, e.g. {"query":"invoice"}.` };
    }
    return { schema: toSchemaText(matched) };
  }
  // Real, explicit product ask (2026-08-21): "let schema search add
  // search capability by name to list all that type of table" —
  // data_table.list was disabled the same session, leaving no way to
  // discover a real table name at all; a keyword search here (matched
  // against table names/descriptions/field names, same real matching
  // data_table.list's own keyword-search era used) restores discovery
  // without re-enabling that tool. A keyword match returns just the
  // matching table NAMES, not their full schemas — the model still
  // calls this again with the exact tableName to get one real schema,
  // same two-step shape as before, just entered through one tool now.
  const query = (args.query || "").trim().toLowerCase();
  if (!query) {
    return { schema: 'Give either "tableName" (for one table\'s real schema) or "query" (a keyword to find the real table name).' };
  }
  // Real, explicit product ask (2026-08-22): "allow only to query with
  // minimum 3 letter, never allow null or empty string" — a 1-2 char
  // keyword (e.g. "a", "in") substring-matches half of ENTITY_CONFIGS'
  // own keys/descriptions/fields, returning a near-useless wall of
  // matches instead of a real narrowing search.
  if (query.length < 3) {
    return { schema: `"query" must be at least 3 characters — "${args.query}" is too short to narrow down a real table.` };
  }
  const matches = ENTITY_CONFIGS.filter(
    (c) =>
      c.entityKey.includes(query) ||
      (c.description || "").toLowerCase().includes(query) ||
      c.canonicalFields.some((f) => f.toLowerCase().includes(query))
  );
  if (!matches.length) {
    return { schema: `No real table matched "${args.query}".` };
  }
  return { schema: `Matching tables: ${matches.map((c) => c.entityKey).join(", ")} — call again with the exact "tableName" for one's real schema.` };
}

// Real, live-found bug (2026-08-24, interaction_log 3134): fieldValues
// (the ENUM(...) list toSchemaText shows above) is a static, hand-
// maintained list of every value ERPNext's OWN DocType definition
// theoretically allows — genuinely correct as a schema, but a real
// tenant's actual data very often uses only a SUBSET of it. Confirmed
// live: Sales Invoice status is documented as one of 13 possible
// values, this tenant's real data only ever has "Paid"/"Overdue" — the
// model picked the technically-valid-but-never-actually-used "Unpaid"
// and got a genuine, structurally-guaranteed zero. A written warning in
// the entity's own description ("status labels vary by tenant...")
// didn't stick reliably — the real, portable fix is showing the field's
// REAL values for THIS tenant, not asking the model to remember not to
// trust a list it was just handed. entityLiveEnumFields names EVERY
// field (if any) that needs this live lookup for a given table — real
// live check found most entities configure exactly one (almost always
// "status"), but "issue" (Support Ticket) genuinely configures two
// ("status" AND "priority") — only handling the first would silently
// leave "priority" guessable, the exact same bug class this exists to
// close.
export function entityLiveEnumFields(tableName: string): string[] {
  const c = ENTITY_CONFIGS.find((c) => c.entityKey === tableName);
  return c?.fieldValues ? Object.keys(c.fieldValues) : [];
}

// Pure, testable merge: swaps the static ENUM(...) list for that one
// field with the real distinct values actually found in this tenant's
// data (see relayReasoningEngine.ts's own live-enum-discovery branch —
// reuses the SAME real continueAggregateFetch op:"count"/groupBy
// machinery analytics.aggregate/execute_query already use, never a new
// plugin capability). An empty liveValues list (a genuinely empty
// table, or the live lookup hasn't run yet) leaves the static list
// untouched rather than showing a misleading empty ENUM().
export function mergeLiveEnumValues(schemaText: string, field: string, liveValues: string[]): string {
  if (!liveValues.length) return schemaText;
  const pattern = new RegExp(`${field} \\([^)]*\\)`);
  if (!pattern.test(schemaText)) return schemaText;
  return schemaText.replace(pattern, `${field} (${liveValues.join(", ")})`);
}

export const schemaModule: MCPModule = {
  name: "data_table",
  description: "Discover tables & schemas.",
  tools: [
    {
      name: "data_table.list",
      module: "utilities",
      description: `List all tables.`,
      parameters: { type: "object", properties: {} },
      promptRules: [DATA_QUERY_DISCIPLINE],
      handler: async () => listTables(),
    },
    {
      name: "data_table.search_schema",
      module: "utilities",
      description: `Get table schema. tableName (exact) or query (keyword, min 3 chars).`,
      parameters: {
        type: "object",
        properties: {
          tableName: { type: "string" },
          query: { type: "string" },
        },
      },
      // Asking for a table's schema IS the signal "I'm about to build a
      // query" — the model gets the full query discipline (join/groupBy/
      // metrics syntax, "never guess fields", one call) before it ever
      // constructs execute_query.
      promptRules: [DATA_QUERY_DISCIPLINE],
      handler: async (args) => getTableSchema(args),
    },
  ],
};
