import { MCPModule } from "../../core/types";
import { systemConnector } from "../../config/system.config";
import { ENTITY_CONFIGS } from "../../config/entities.config";
import { EntityUtils, resolveEntityKey, stripDottedPrefix, stripFieldQualifiers } from "../../core/entityUtils";
import { resolveRelativePeriod } from "../../core/relativePeriods";
import { DATA_QUERY_DISCIPLINE } from "../../systemPrompt/core/dataQueryDiscipline";

const VALID_ENTITY_KEYS = EntityUtils.realEntityKeys();

function assertKnownEntity(entityKey: string, label = "entityKey") {
  // resolveEntityKey has already run in normalizeExecuteQueryArgs, so a
  // real alias ("invoice" -> sales_invoice) never reaches here. What
  // does reach here unresolved is a genuine wrong guess — answer it with
  // the CLOSEST real entities (same string as a token), not the full
  // 90-entity dump the model can't act on. Confirmed live: the model,
  // handed the whole list, abandoned the query and punted to a PDF
  // instead of retrying with a real name.
  if (!entityKey || !VALID_ENTITY_KEYS.has(entityKey)) {
    const needle = String(entityKey || "").toLowerCase();
    const near = [...VALID_ENTITY_KEYS].filter((k) => needle && (k.includes(needle) || needle.includes(k)));
    const hint = near.length ? `did you mean: ${near.join(", ")}` : `real entities: ${[...VALID_ENTITY_KEYS].join(", ")}`;
    throw new Error(`Unknown entity "${entityKey}" for database_engine.execute_query's "${label}" — ${hint}`);
  }
}

function uniqueImplicitMetricName(field: string | undefined, op: string, existingMetrics: { name?: string }[]): string {
  const base = field ? `${op}_${field}` : op;
  const taken = new Set(existingMetrics.map((m) => m?.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

// Real, live-found bugs (interaction_log 3090; "every customer's overdue
// + paid/unpaid counts"): once a query gets non-trivial the model reaches
// for SQL-schema habits none of which are real names in this tool's own
// schema — "table.field" qualifiers (groupBy:"customer.display_name",
// metrics[].field:"sales_invoice.outstanding_amount", filter keys like
// "sales_invoice.status"), "_id"-suffixed group keys (groupBy:"customer_id"),
// and alias entity names (entityKey:"invoice"). Each failure made the
// model conclude the query was "restricted" and give up — a false
// capability denial. Repaired deterministically here, in one place,
// before anything runs — every canonical field is bare and never ends
// in "_id", so the strips are lossless no-ops on an already-correct
// call. All of it lives in core/entityUtils.ts (EntityUtils).
function normalizeFilterKeys(filters: any): any {
  if (!filters || typeof filters !== "object") return filters;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(filters)) out[stripDottedPrefix(k)] = v;
  return out;
}

export function normalizeExecuteQueryArgs(args: any): any {
  if (!args || typeof args !== "object") return args;
  const out: any = { ...args };
  if (typeof out.entityKey === "string") out.entityKey = resolveEntityKey(out.entityKey);
  if (typeof out.groupBy === "string") out.groupBy = stripFieldQualifiers(out.groupBy);
  if (typeof out.field === "string") out.field = stripDottedPrefix(out.field);
  if (Array.isArray(out.fields)) out.fields = out.fields.map((f: any) => (typeof f === "string" ? stripDottedPrefix(f) : f));
  if (out.filters) out.filters = normalizeFilterKeys(out.filters);
  if (Array.isArray(out.metrics)) {
    out.metrics = out.metrics.map((m: any) => ({
      ...m,
      field: typeof m?.field === "string" ? stripDottedPrefix(m.field) : m?.field,
      filters: m?.filters ? normalizeFilterKeys(m.filters) : m?.filters,
    }));
  }
  if (out.join) {
    const normalizeStep = (s: any) => ({
      ...s,
      entityKey: typeof s?.entityKey === "string" ? resolveEntityKey(s.entityKey) : s?.entityKey,
      leftKey: typeof s?.leftKey === "string" ? stripFieldQualifiers(s.leftKey) : s?.leftKey,
      rightKey: typeof s?.rightKey === "string" ? stripFieldQualifiers(s.rightKey) : s?.rightKey,
      fields: Array.isArray(s?.fields) ? s.fields.map((f: any) => (typeof f === "string" ? stripDottedPrefix(f) : f)) : s?.fields,
      filters: s?.filters ? normalizeFilterKeys(s.filters) : s?.filters,
    });
    out.join = Array.isArray(out.join) ? out.join.map(normalizeStep) : normalizeStep(out.join);
  }
  return out;
}

export const JOIN_ROW_CAP = 200;
export const JOIN_FETCH_CAP = 1000;

export function performJoin(
  leftRows: Record<string, any>[],
  rightRows: Record<string, any>[],
  leftKey: string,
  rightKey: string,
  leftFields?: string[],
  rightFields?: string[],
  limit = JOIN_ROW_CAP,
  // Real, live-found bug (2026-08-24, interaction_log 3105): a real
  // "customer phone + count of paid/unpaid invoices" query chained TWO
  // separate one-to-many joins onto the same base — customer->contact
  // (enrichment only, just fetching a phone number) AND customer->
  // sales_invoice (the entity actually being counted/summed). Confirmed
  // live against real data: many companies have 7-10 real Contact rows
  // each (Patel Systems: 10, Menon Electricals: 10, ...) — the correct
  // one-to-many fan-out semantics above (every left row × every matching
  // right row) is exactly right for sales_invoice, but applied to
  // contact too, it multiplied every invoice by however many contacts
  // that customer had (10 contacts x 3 real invoices = 30 merged rows
  // for one customer), inflating paid/unpaid counts and total_due by
  // that same multiplier. `dedupRightPerKey` caps this ONE join step to
  // its first real match per key instead — real fan-out semantics stay
  // exactly correct for the step that's actually being aggregated
  // (sales_invoice), while a step used purely to carry a display field
  // (contact) can never multiply anything. The caller (relayReasoningEngine.ts's
  // join-chain handler) decides per step whether that step's own fields
  // feed groupBy/metrics at all — only a step that doesn't gets deduped.
  dedupRightPerKey = false
): { rows: Record<string, any>[]; matchedCount: number; leftCount: number; rightCount: number; truncated: boolean } {
  // Real, live-found bug (2026-08-23/24, confirmed live: every customer's
  // paid_count/unpaid_count exactly matched only ONE arbitrary invoice,
  // never a real count across all of them): this indexed the right side
  // as ONE row per key (Map<string, Row>), so `.set()` on a real
  // one-to-many relationship (many sales_invoice rows sharing the same
  // "customer" value) silently OVERWROTE every earlier match — each
  // customer only ever got joined to whichever invoice happened to be
  // fetched last, not all of them. This never showed up in the original
  // 2-way join tests (all used a genuine 1:1 relationship, one row per
  // key on both sides) — the combined join+aggregation feature built
  // tonight was the first real usage to actually exercise a one-to-many
  // join with real multi-row data, exposing a bug latent in this
  // function since before tonight. Fixed: real one-to-many INNER JOIN
  // semantics — every left row is merged against EVERY matching right
  // row, producing one output row per real (left, right) pair, same as
  // a standard SQL join would.
  const rightIndex = new Map<string, Record<string, any>[]>();
  for (const r of rightRows) {
    const k = r[rightKey];
    if (k === undefined || k === null || k === "") continue;
    const key = String(k);
    (rightIndex.get(key) || rightIndex.set(key, []).get(key)!).push(r);
  }
  const pickFields = (row: Record<string, any>, fields?: string[]) =>
    fields && fields.length ? Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]])) : row;

  const merged: Record<string, any>[] = [];
  for (const l of leftRows) {
    const k = l[leftKey];
    if (k === undefined || k === null || k === "") continue;
    const matches = rightIndex.get(String(k));
    if (!matches || !matches.length) continue;
    const leftPart = pickFields(l, leftFields);
    for (const match of dedupRightPerKey ? matches.slice(0, 1) : matches) {
      const rightPart = pickFields(match, rightFields);
      const combined: Record<string, any> = { ...leftPart };
      for (const [k2, v2] of Object.entries(rightPart)) {
        combined[k2 in combined ? `right_${k2}` : k2] = v2;
      }
      merged.push(combined);
    }
  }
  return {
    rows: merged.slice(0, limit),
    matchedCount: merged.length,
    leftCount: leftRows.length,
    rightCount: rightRows.length,
    truncated: merged.length > limit,
  };
}

/** Whether a join step's own carried fields are actually referenced by the
 *  aggregation on top (groupBy / any metric's field or filter keys / the
 *  top-level op+field+filters shape) — see performJoin's own
 *  "dedupRightPerKey" doc comment for the full "why" this exists. A step
 *  whose fields never appear in any of those is pure display enrichment
 *  (e.g. carrying a phone number) — real one-to-many fan-out for THAT
 *  step would only ever multiply rows the aggregation doesn't even look
 *  at, never produce a correct extra count/sum. `stepFields` with no
 *  entries at all (a join step with no "fields") trivially can't feed
 *  anything, so it's always safe to dedup too. */
export function stepFeedsAggregation(stepFields: string[] | undefined, origArgs: any): boolean {
  // No explicit "fields" on the join step means the ENTIRE right-side
  // row merges in unrestricted (performJoin's own pickFields returns the
  // whole row when no field list is given, not nothing) — there's no
  // safe way to rule out that the aggregation depends on something in
  // it, so this defaults to TRUE (real fan-out preserved) rather than
  // risk silently deduping a step the aggregation actually needs. Only
  // a step that explicitly names its own carried fields, none of which
  // the aggregation references, is provably safe to cap.
  if (!stepFields || !stepFields.length) return true;
  const fieldSet = new Set(stepFields);
  if (origArgs?.groupBy && fieldSet.has(origArgs.groupBy)) return true;
  if (origArgs?.field && fieldSet.has(origArgs.field)) return true;
  if (origArgs?.filters && Object.keys(origArgs.filters).some((f) => fieldSet.has(f))) return true;
  if (Array.isArray(origArgs?.metrics)) {
    for (const m of origArgs.metrics) {
      if (m?.field && fieldSet.has(m.field)) return true;
      if (m?.filters && Object.keys(m.filters).some((f) => fieldSet.has(f))) return true;
    }
  }
  return false;
}

// In-memory filter match — same real op vocabulary toNativeFilters/
// toFilterTriple use for a native ERPNext fetch (like/in/between/>/</
// relative), applied here to rows we ALREADY have in hand (a joined
// result) rather than translated into a native ERPNext filter. Never
// raw SQL, never a second query — this only ever runs against rows this
// same permission-respecting session already fetched.
function matchesFilters(row: Record<string, any>, filters?: Record<string, any>): boolean {
  if (!filters) return true;
  for (const [field, cond] of Object.entries(filters)) {
    const value = row[field];
    if (cond === null || typeof cond !== "object" || Array.isArray(cond)) {
      if (value !== cond) return false;
      continue;
    }
    const { op, value: condValue } = cond as { op: string; value: any };
    if (op === "like") {
      const needle = String(condValue).replace(/^%|%$/g, "").toLowerCase();
      if (!String(value ?? "").toLowerCase().includes(needle)) return false;
    } else if (op === "in") {
      if (!Array.isArray(condValue) || !condValue.includes(value)) return false;
    } else if (op === ">") {
      if (!(Number(value) > Number(condValue))) return false;
    } else if (op === "<") {
      if (!(Number(value) < Number(condValue))) return false;
    } else if (op === "between") {
      const [lo, hi] = condValue;
      if (!(Number(value) >= Number(lo) && Number(value) <= Number(hi))) return false;
    } else if (op === "relative") {
      const [startIso, endIso] = resolveRelativePeriod(String(condValue), new Date().toISOString().slice(0, 10));
      const d = String(value ?? "").slice(0, 10);
      if (!(d >= startIso && d <= endIso)) return false;
    } else {
      return false; // unknown op — fail closed, never a silent false-positive match
    }
  }
  return true;
}

function computeMetric(op: string, field: string | undefined, rows: Record<string, any>[]): number {
  if (op === "count") return rows.length;
  const nums = rows.map((r) => Number(r[field!])).filter((n) => !Number.isNaN(n));
  if (op === "sum") return nums.reduce((a, b) => a + b, 0);
  if (op === "avg") return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  if (op === "min") return nums.length ? Math.min(...nums) : 0;
  if (op === "max") return nums.length ? Math.max(...nums) : 0;
  throw new Error(`op "${op}" is not supported (sum/avg/count/min/max are)`);
}

// Real, explicit product ask (2026-08-23/24): "N join and metriculate" —
// aggregate a query that ALSO joined in another table. ERPNext's own
// native aggregate (systemConnector.aggregate) operates on ONE doctype
// only — it has no way to aggregate across a joined result at all — so
// once a join is in play, the group/sum/count math has to happen here,
// in-memory, over the rows this same permission-respecting session
// already fetched+joined (never raw SQL, never a second live query).
// Same real output shapes systemConnector.aggregate/runMetrics already
// produce ({overall:{value,count}} / {groups:[{key,value,count}]} /
// {groups:[{key,...metricNames}]}) so buildExecuteQueryMetadata/
// paginateGroups need no special-casing for the joined case.
// carryFields (the real columns a join step asked to pull in, e.g.
// display_name/phone) ride along in each group's own output row too —
// constant within a group (every row in one group shares the same
// joined-in parent record), so the person's actual real ask ("total
// overdue AND the customer's phone number, together") is answered in
// one real row, not two separate, uncorrelated results.
export function aggregateRows(
  rows: Record<string, any>[],
  args: { groupBy?: string; op?: string; field?: string; filters?: Record<string, any>; metrics?: any[] },
  carryFields: string[] = []
): any {
  const baseRows = args.filters ? rows.filter((r) => matchesFilters(r, args.filters)) : rows;

  if (!args.groupBy) {
    if (Array.isArray(args.metrics) && args.metrics.length) {
      const row: Record<string, any> = {};
      for (const m of args.metrics) {
        // Same rule as the grouped path below: a metric with its own
        // filters is self-contained (computed from the FULL rows), not
        // ANDed onto the global-filtered baseRows.
        const subset =
          m.filters && Object.keys(m.filters).length > 0 ? rows.filter((r) => matchesFilters(r, m.filters)) : baseRows;
        row[m.name] = computeMetric(m.op, m.field, subset);
      }
      return { overall: row, count: baseRows.length };
    }
    return { overall: { value: computeMetric(args.op || "count", args.field, baseRows), count: baseRows.length } };
  }

  const groups = new Map<string, Record<string, any>[]>();
  for (const r of baseRows) {
    const key = r[args.groupBy];
    if (key === undefined || key === null || key === "") continue;
    const arr = groups.get(String(key)) || [];
    arr.push(r);
    groups.set(String(key), arr);
  }

  // Real, live-found bug (2026-08-24, recurred all day, 4 different
  // prompt-wording attempts didn't stop it): a top-level "filters" (or a
  // join step's own) narrows baseRows/groups BEFORE any metric runs — a
  // metric's own filters could only ever narrow FURTHER, never recover a
  // row the top-level filter already excluded. Confirmed live over and
  // over: status:"Overdue" at the top level + a metric wanting
  // status:"Paid" always came back a structurally-guaranteed 0, no
  // matter how the model phrased its query. Real, structural fix instead
  // of a 5th prompt attempt: when a metric's OWN filters share a key
  // with the top-level filters, that metric's own value WINS for that
  // key (same real "metric overrides global on conflict" semantic
  // startMultiMetricFetch, the relay's own non-join metrics path, has
  // always had — this just brings the joined/grouped path in line with
  // it) — computed against the FULL unfiltered rows for that group, not
  // the already-narrowed baseRows subset, since that's exactly the rows
  // the top-level filter would otherwise have hidden from it. A metric
  // with no filters, or filters on a DIFFERENT key, is completely
  // unaffected — still computed from the already-filtered group, exactly
  // as before.
  const fullGroupsForOverride = args.filters
    ? (() => {
        const m = new Map<string, Record<string, any>[]>();
        for (const r of rows) {
          const key = r[args.groupBy!];
          if (key === undefined || key === null || key === "") continue;
          const arr = m.get(String(key)) || [];
          arr.push(r);
          m.set(String(key), arr);
        }
        return m;
      })()
    : undefined;

  // Real, live-found gap (2026-08-24) — same class of bug as
  // zeroRowsJoinNote below, just without a join involved: a plain
  // groupBy over REAL, non-empty base rows can only come back with ZERO
  // groups if literally every row's own groupBy field read undefined/
  // null/empty (the loop right above silently skips those) — for a real
  // native entity field, that's a strong, deterministic signal of a
  // wrong groupBy field name, not genuinely empty data. Attached here
  // (not in buildExecuteQueryMetadata) since this is the one place that
  // still has BOTH the real base row count and the grouped result
  // together — buildExecuteQueryMetadata only ever sees the
  // already-grouped shape, with no way to tell "grouped from zero real
  // rows" from "grouped from real rows, every one dropped by a bad key".
  const wrongGroupByNote =
    baseRows.length > 0 && groups.size === 0
      ? { _note: `0 groups from ${baseRows.length} real matching rows — this usually means "groupBy" is the wrong field name, not genuinely empty data. Recheck the query against the real schema (search_schema again if unsure) before reporting no records.` }
      : {};

  if (Array.isArray(args.metrics) && args.metrics.length) {
    const names = args.metrics.map((m) => m.name);
    const groupRows = Array.from(groups.entries()).map(([key, rowsInGroup]) => {
      const row: Record<string, any> = { key };
      for (const f of carryFields) if (f in rowsInGroup[0]) row[f] = rowsInGroup[0][f];
      for (const m of args.metrics!) {
        const hasOwnFilters = m.filters && Object.keys(m.filters).length > 0;
        let subset: Record<string, any>[];
        if (hasOwnFilters) {
          // A metric that declares its OWN filters is self-contained —
          // computed from those alone, against the group's FULL rows
          // (pre-global-filter). The top-level `filters` is only the
          // default for metrics that DON'T specify their own. Merging
          // the two (the old behaviour) structurally guarantees 0 the
          // moment they touch related fields — confirmed live: global
          // {status:"Overdue", outstanding_amount:>0} + metric
          // {status:"Paid"} -> a paid invoice's outstanding IS 0 -> the
          // surviving global outstanding>0 clause kills every match, so
          // paid_count/unpaid_count came back all-zero.
          const fullRowsForThisGroup = (fullGroupsForOverride ?? groups).get(key) || [];
          subset = fullRowsForThisGroup.filter((r) => matchesFilters(r, m.filters));
        } else {
          subset = rowsInGroup; // uses the global-filtered group
        }
        row[m.name] = computeMetric(m.op, m.field, subset);
      }
      return row;
    });
    for (const row of groupRows) for (const n of names) if (!(n in row)) row[n] = 0;
    groupRows.sort((a, b) => (b[names[0]] || 0) - (a[names[0]] || 0));

    // Real, explicit product direction (2026-08-24): no more long
    // explanatory prose to the model — the structural override fix
    // above (a metric's own filters win on a colliding top-level key)
    // is what actually fixes the real numbers now, not a note asking
    // the model to notice and self-correct. Only real signal kept: if
    // EVERY metric is 0 for EVERY group, that's a query that plainly
    // found nothing at all — short, plain, actionable.
    const allMetricsAllZero = groupRows.length > 0 && names.every((n) => groupRows.every((r) => !r[n]));
    const allZeroNote = allMetricsAllZero ? { _note: "All values are zero — try again with a different query." } : {};
    return { groups: groupRows, ...wrongGroupByNote, ...allZeroNote };
  }

  const groupRows = Array.from(groups.entries()).map(([key, rowsInGroup]) => {
    const row: Record<string, any> = { key, value: computeMetric(args.op || "count", args.field, rowsInGroup), count: rowsInGroup.length };
    for (const f of carryFields) if (f in rowsInGroup[0]) row[f] = rowsInGroup[0][f];
    return row;
  });
  groupRows.sort((a, b) => b.value - a.value);
  return { groups: groupRows, ...wrongGroupByNote };
}

const GROUPS_PAGE_COUNT = 20;

export function paginateGroups(groups: Record<string, any>[], pageIndex = 1, pageCount = GROUPS_PAGE_COUNT) {
  pageCount = Math.min(pageCount, GROUPS_PAGE_COUNT);
  const start = (pageIndex - 1) * pageCount;
  return {
    groups: groups.slice(start, start + pageCount),
    totalGroups: groups.length,
    pageIndex,
    pageCount,
    hasMore: start + pageCount < groups.length,
  };
}

export async function runMetrics(
  entityKey: string,
  groupBy: string,
  metrics: any[],
  credential: any,
  pageIndex?: number,
  pageCount?: number
): Promise<{ groups: Record<string, any>[]; totalGroups: number; pageIndex: number; pageCount: number; hasMore: boolean }> {
  const results = await Promise.all(
    metrics.map((m) => {
      if (m.op !== "count" && !m.field) throw new Error(`metric "${m.name}": "field" required for op "${m.op}"`);
      return systemConnector.aggregate(entityKey, credential, { field: m.field, op: m.op, filters: m.filters, groupBy });
    })
  );
  const merged = new Map<string, Record<string, any>>();
  results.forEach((result: any, i: number) => {
    const name = metrics[i].name;
    for (const g of result.groups || []) {
      const row = merged.get(g.key) || { key: g.key };
      row[name] = g.value;
      merged.set(g.key, row);
    }
  });
  const names = metrics.map((m) => m.name);
  const groups = Array.from(merged.values()).map((row) => {
    for (const n of names) if (!(n in row)) row[n] = 0;
    return row;
  });
  groups.sort((a, b) => (b[names[0]] || 0) - (a[names[0]] || 0));
  return paginateGroups(groups, pageIndex, pageCount);
}

// METADATA BUILDER - Strips result to what LLM can see
// Real, live-found bug (2026-08-23/24, interaction_log 3080): a real
// join used the wrong leftKey/rightKey (a schema-notation misread, since
// fixed separately) and silently matched zero rows — no error, since a
// mismatched key just means the field never existed on any row. The
// model got rowCount:0 and confidently reported "no records available"
// for a tenant that very much has records. A genuinely empty PLAIN
// filtered query (no join) is completely normal and not worth flagging —
// this only fires when a join was actually involved, the one case where
// a silent zero is a real, common symptom of a wrong join/field name
// rather than genuinely empty data.
function zeroRowsJoinNote(rowCount: number, args: any): { _note: string } | {} {
  return rowCount === 0 && args?.join ? { _note: "0 rows matched — for a join, this usually means a wrong leftKey/rightKey/field name, not genuinely empty data. Recheck the query against the real schema (search_schema again if unsure) before reporting no records." } : {};
}

// Real, explicit product ask (2026-08-24): "in return to llm also send
// executed query... so llm understand and correct if the executed query
// is wrong" — the model only ever saw the RESULT of what it asked for
// (rowCount/columns/aggregates), never the query itself as the server
// actually ran it. Live-confirmed failure mode this closes: a real
// multi-turn session (interaction_log 3097/3098) where the model's
// query silently dropped a field ("phone") it had explicitly requested
// on earlier turns in the SAME conversation — with no executed-query
// echo, there was nothing in its own context to notice the drift
// against. `query` is `args` exactly as received (entityKey, filters,
// groupBy, metrics, join, fields, ...) — never re-derived or guessed,
// so what the model sees here is always the real, ACTUAL query that ran,
// not a description of it.
export function buildExecuteQueryMetadata(result: any, args: any): any {
  const aggKey = (op: string, field?: string) => (field ? `${op}_${field}` : op);

  if (result && typeof result === "object" && Array.isArray(result.groups)) {
    return {
      rowCount: result.totalGroups,
      columns: Object.keys(result.groups[0] || {}),
      aggregates: result.overall?.value !== undefined ? { [aggKey(args?.op || "total", args?.field)]: result.overall.value } : {},
      page: result.pageIndex,
      totalPages: result.pageCount ? Math.ceil(result.totalGroups / result.pageCount) : 1,
      hasMore: result.hasMore,
      query: args,
      // result._note is aggregateRows' own real "wrong groupBy field"
      // signal (see its own doc comment) — takes priority when present;
      // zeroRowsJoinNote covers the separate join-specific case
      // (performJoin's own zero matchedCount, never reaches aggregateRows
      // at all for a plain join with no groupBy/metrics).
      ...(result._note ? { _note: result._note } : zeroRowsJoinNote(result.totalGroups, args)),
    };
  }

  if (result && typeof result === "object" && Array.isArray(result.rows)) {
    return {
      rowCount: result.matchedCount,
      columns: Object.keys(result.rows[0] || {}),
      aggregates: {},
      page: 1,
      totalPages: 1,
      hasMore: result.truncated,
      query: args,
      ...zeroRowsJoinNote(result.matchedCount, args),
    };
  }

  if (result && typeof result === "object" && result.overall !== undefined) {
    return {
      rowCount: result.overall.count,
      columns: [],
      aggregates: { [aggKey(args?.op || "total", args?.field)]: result.overall.value },
      page: 1,
      totalPages: 1,
      hasMore: false,
      query: args,
      ...zeroRowsJoinNote(result.overall.count, args),
    };
  }

  return result;
}

export const dataServerModule: MCPModule = {
  name: "database_engine",
  description: "Execute generated structured query. Call data_table.search_schema first.",
  tools: [
    {
      name: "database_engine.execute_query",
      module: "utilities",
      description: `Execute generated structured query (not SQL). Generate query from schema discovery.

entityKey: canonical entity key
filters: same as .list
groupBy: field to group by
op: sum|avg|count|min|max (field required unless count)
metrics: [{name, op, field?, filters}] (requires groupBy)
join: [{entityKey, leftKey, rightKey, fields?, filters?}, ...] — array, chains any number of tables. Combine with groupBy/op/metrics to aggregate ON the joined rows (e.g. sales_invoice metrics + customer join, one call).
pageIndex: 1-based, pageCount: default 20

IMPORTANT: Generate query using field/join keys from data_table.search_schema. Never guess.`,
      promptRules: [DATA_QUERY_DISCIPLINE],
      parameters: {
        type: "object",
        properties: {
          entityKey: { type: "string" },
          filters: { type: "object" },
          fields: { type: "array", items: { type: "string" } },
          groupBy: { type: "string" },
          op: { type: "string", enum: ["sum", "avg", "count", "min", "max"] },
          field: { type: "string" },
          metrics: { type: "array", items: { type: "object", properties: { name: { type: "string" }, op: { type: "string", enum: ["sum", "avg", "count", "min", "max"] }, field: { type: "string" }, filters: { type: "object" } }, required: ["name", "op"] } },
          join: {
            type: "array",
            items: {
              type: "object",
              properties: { entityKey: { type: "string" }, leftKey: { type: "string" }, rightKey: { type: "string" }, fields: { type: "array", items: { type: "string" } }, filters: { type: "object" } },
              required: ["entityKey", "leftKey", "rightKey"],
            },
          },
          pageIndex: { type: "number" },
          pageCount: { type: "number" },
        },
        required: ["entityKey"],
      },
      handler: async (rawArgs, session) => {
        const args = normalizeExecuteQueryArgs(rawArgs);
        assertKnownEntity(args.entityKey);

        // N-way join chain — a single object (the old shape) is
        // normalized to a length-1 array so any in-flight/older caller
        // keeps working unchanged.
        let joinedRows: Record<string, any>[] | undefined;
        let joinMeta: { matchedCount: number; leftCount: number; rightCount: number; truncated: boolean } | undefined;
        // Real, live-found gap (2026-08-23/24, interaction_log 3082): a
        // real "customer" base already has its OWN "phone" field — no
        // join needed at all — but the model tried joining a separate
        // "contact" table anyway, since a base-entity field with no join
        // step of its own had no way to land in the aggregated output.
        // args.fields (the base's own requested fields) now seeds
        // carryFields from the start, same treatment a join step's own
        // "fields" already gets — never trimmed away (unlike leftFields,
        // this is purely additive), so a plain base field rides through
        // into each group's own output row exactly like a joined one
        // does.
        let carryFields: string[] = Array.isArray(args.fields) ? [...args.fields] : [];
        // Real, live-found bug (2026-08-23/24): the LAST merge step used
        // to always cap at JOIN_ROW_CAP (200, a DISPLAY limit for a
        // plain join) — but once a join combines with groupBy/metrics/op,
        // the aggregation needs EVERY real joined row to compute correct
        // counts/sums, not just the first 200. Confirmed live: a real
        // 140-customer/~900-invoice join+aggregate silently undercounted
        // any customer whose invoices fell past row 200 (every group came
        // back looking like it had exactly one invoice). Never truncate
        // to the display cap when aggregation is going to run on top —
        // only a genuinely plain join (no metrics/op) still gets the
        // small display-sized cap on its final page.
        const willAggregate = (Array.isArray(args.metrics) && args.metrics.length) || !!args.op;
        if (args.join) {
          const steps = Array.isArray(args.join) ? args.join : [args.join];
          if (!steps.length) throw new Error('"join" must be a real join step (or array of steps)');
          let accumulated = await systemConnector.list(args.entityKey, session.credential, { filters: args.filters, limit: JOIN_FETCH_CAP });
          const leftCount = accumulated.length;
          let truncatedAny = false;
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            assertKnownEntity(step.entityKey, `join[${i}].entityKey`);
            if (!step.leftKey || !step.rightKey) throw new Error(`join[${i}] needs both "leftKey" and "rightKey"`);
            const rightRows = await systemConnector.list(step.entityKey, session.credential, { filters: step.filters, limit: JOIN_FETCH_CAP });
            const isLast = i === steps.length - 1;
            // See performJoin's own "dedupRightPerKey" doc comment — same
            // real bug, same fix, as relayReasoningEngine.ts's own join-
            // chain handler: only a step whose fields actually feed
            // groupBy/metrics keeps real one-to-many fan-out; a pure
            // display-enrichment step (e.g. a phone-number lookup) is
            // capped to its first match so it can never multiply rows an
            // unrelated aggregation is counting/summing.
            const merged = performJoin(
              accumulated,
              rightRows,
              step.leftKey,
              step.rightKey,
              undefined,
              step.fields,
              isLast && !willAggregate ? JOIN_ROW_CAP : JOIN_FETCH_CAP,
              willAggregate && !stepFeedsAggregation(step.fields, args)
            );
            accumulated = merged.rows;
            truncatedAny = truncatedAny || merged.truncated;
            // Real, explicit product ask (2026-08-24): "its abt how u
            // handled" — a join step's own carried field (e.g. "id") sat
            // next to "key" (the real group identity) with no way to
            // tell they're not the same thing — confirmed live: a
            // customer-grouped result's own "id" column was actually one
            // arbitrary INVOICE's id, not the customer's. Aliased under
            // the join step's own entity name instead of overwritten —
            // "id" from a "sales_invoice" step becomes
            // "sales_invoice_id" — self-documenting, and the original
            // bare field stays untouched (never deleted) so a LATER
            // step's own leftKey can still reference it if it needs to.
            //
            // Only for a COMBINED join+aggregation — a plain join (no
            // groupBy/metrics/op) has no "key" column to be ambiguous
            // against at all, and performJoin's own right_ collision
            // renaming already disambiguates that shape fine on its own;
            // aliasing on top there was pure redundant noise, not a real
            // fix (caught by this file's own existing plain-join test).
            if (willAggregate && Array.isArray(step.fields) && step.fields.length) {
              const prefix = step.entityKey;
              accumulated = accumulated.map((r) => {
                const out = { ...r };
                for (const f of step.fields!) if (f in out) out[`${prefix}_${f}`] = out[f];
                return out;
              });
              carryFields.push(...step.fields.map((f: string) => `${prefix}_${f}`));
            }
            if (isLast) joinMeta = { matchedCount: merged.matchedCount, leftCount, rightCount: rightRows.length, truncated: truncatedAny };
          }
          joinedRows = accumulated;
        }

        if (Array.isArray(args.metrics) && args.metrics.length) {
          if (!args.groupBy) throw new Error('"groupBy" required when using "metrics"');
          const metrics = args.op ? [{ name: uniqueImplicitMetricName(args.field, args.op, args.metrics), op: args.op, field: args.field }, ...args.metrics] : args.metrics;
          if (joinedRows) {
            const result = aggregateRows(joinedRows, { groupBy: args.groupBy, metrics }, carryFields);
            return buildExecuteQueryMetadata({ ...result, ...paginateGroups(result.groups, args.pageIndex, args.pageCount) }, args);
          }
          const result = await runMetrics(args.entityKey, args.groupBy, metrics, session.credential, args.pageIndex, args.pageCount);
          return buildExecuteQueryMetadata(result, args);
        }

        if (args.op) {
          if (args.op !== "count" && !args.field) throw new Error(`"field" required for op "${args.op}"`);
          if (joinedRows) {
            let result: any = aggregateRows(joinedRows, { groupBy: args.groupBy, op: args.op, field: args.field }, carryFields);
            if (args.groupBy && Array.isArray(result.groups)) result = { ...result, ...paginateGroups(result.groups, args.pageIndex, args.pageCount) };
            return buildExecuteQueryMetadata(result, args);
          }
          let result: any = await systemConnector.aggregate(args.entityKey, session.credential, { field: args.field, op: args.op, filters: args.filters, groupBy: args.groupBy });
          if (args.groupBy && Array.isArray(result.groups)) {
            result = { ...result, ...paginateGroups(result.groups, args.pageIndex, args.pageCount) };
          }
          return buildExecuteQueryMetadata(result, args);
        }

        if (joinedRows) {
          return buildExecuteQueryMetadata({ rows: joinedRows, matchedCount: joinMeta!.matchedCount, truncated: joinMeta!.truncated }, args);
        }

        throw new Error('database_engine.execute_query needs "op"/"metrics" or "join"');
      },
    },
  ],
};