import axios, { AxiosInstance } from "axios";
import { SystemConnector, UserCredential } from "../core/types";
import erpnextClient, { getDocList, getDoc, createDoc, updateDoc, callMethod } from "./client";
import { appConfig } from "../config/app.config";
import { ERPNEXT_ENTITY_MAP, nativeFields, toNativeData, toNativeFilters, toCanonicalRow } from "./entityMap";
import { ERPNEXT_REPORT_MAP } from "./reportMap";
import { resolveRelativePeriod } from "../core/relativePeriods";
import { computeStatsOp, StatsOp } from "../core/statsCalculator";
import { settingsService } from "../core/settingsService";

/**
 * ERPNext's implementation of the ERP-agnostic connector contract.
 * This is the ONLY file in the codebase that knows ERPNext speaks REST
 * at /api/resource/<doctype>, that impersonation means either a
 * `sid` session cookie or a personal `token <key>:<secret>` header, or
 * that roles live in the "Has Role" child doctype. A future
 * SapConnector implementing the same interface knows none of this.
 */

// Confirmed live 2026-08-12: "highest paid employee" retried
// analytics.aggregate on entityKey:"employee" three times with three
// different field guesses ("salary", "ctc", "net_pay") — Employee
// genuinely has none of these; compensation lives on the linked Salary
// Structure Assignment (ctc) or a specific Salary Slip (net_pay), never
// on Employee itself. A narrow, targeted map from a well-known wrong-
// entity guess straight to the real answer, same "point at the real
// answer instead of a doc file to re-read" philosophy as aggregate()'s
// own generic error below — only extend this for confirmed-live
// confusions, not speculative ones.
const CROSS_ENTITY_FIELD_HINTS: Record<string, Record<string, string>> = {
  employee: {
    salary: 'For compensation, use salary_structure_assignment.ctc (or salary_slip.net_pay for a specific pay period) instead, with groupBy "employee".',
    ctc: 'Use salary_structure_assignment.ctc instead, with groupBy "employee".',
    net_pay: 'Use salary_slip.net_pay instead (a specific pay period), with groupBy "employee".',
    pay: 'For compensation, use salary_structure_assignment.ctc (or salary_slip.net_pay for a specific pay period) instead, with groupBy "employee".',
    compensation: 'Use salary_structure_assignment.ctc (or salary_slip.net_pay for a specific pay period) instead, with groupBy "employee".',
  },
};

/** Pure message-builder for aggregate()'s "no native mapping" error —
 *  extracted (rather than left inline) so the CROSS_ENTITY_FIELD_HINTS
 *  redirect logic is directly unit-testable without touching axios/
 *  ERPNEXT_ENTITY_MAP, same discipline as toFilterTriple below. */
export function buildNoNativeFieldMappingError(entityKey: string, field: string | undefined, validFields: string[]): string {
  const redirect = CROSS_ENTITY_FIELD_HINTS[entityKey]?.[(field || "").toLowerCase()];
  return (
    `"${field}" has no native mapping for "${entityKey}" — the real canonical fields for this entity are: ` +
    `${validFields.join(", ")}. Use one of those as "field".` +
    (redirect ? ` ${redirect}` : "")
  );
}

export class ErpNextConnector implements SystemConnector {
  /** Builds a per-request axios client authenticated AS the given
   *  person — never the shared service account — so every list/get/
   *  create/update below acts, and gets audited in ERPNext, as them.
   *
   *  `timeoutMs` defaults to 15s (fine for plain list/get calls) but is
   *  overridable — confirmed live 2026-08-12: a P&L comparison ("this
   *  month vs last month") makes TWO sequential
   *  frappe.desk.query_report.run calls, each of which recomputes GL
   *  entries across the whole company for its period. That's
   *  meaningfully heavier than a list/get, and intermittently ran past
   *  15s under normal load (reproduced: 5.7s/8.3s on two runs, 24.5s —
   *  a hard timeout plus the model's own retry — on a third, with the
   *  exact user-facing symptom "I can't access the report right now").
   *  See runReport() below for the longer override this enables. */
  private clientFor(credential: UserCredential, timeoutMs = 15000, opts?: { read?: boolean }): AxiosInstance {
    // Read-only escape hatch for full-access admins (see isFullAccessRole
    // below): auth/erpnextAuth.ts stamps credential.fullAccess="true" at
    // login when the person's real ERPNext roles qualify. A role like
    // "System Manager" already means "everything" in THIS app's own
    // roles.policy.ts, but ERPNext's real DocPerm on a given doctype can
    // still be narrower than that role implies (confirmed live 2026-08-16:
    // a System-Manager-only user got real 403s on Payroll Entry/Sales
    // Invoice/GL Entry) — so for reads only, fall back to the same
    // service-level credential getUserRoles()/getCompanyName() already
    // use. Writes never look at this flag; see clientFor's callers below.
    if (opts?.read && credential.fullAccess === "true") {
      return axios.create({
        baseURL: appConfig.erpnext.baseUrl,
        headers: {
          Authorization: `token ${appConfig.erpnext.apiKey}:${appConfig.erpnext.apiSecret}`,
          "Content-Type": "application/json",
        },
        timeout: timeoutMs,
      });
    }
    if (credential.mode === "session") {
      return axios.create({
        baseURL: appConfig.erpnext.baseUrl,
        headers: { Cookie: `sid=${credential.sid}`, "Content-Type": "application/json" },
        timeout: timeoutMs,
      });
    }
    if (credential.mode === "api_key") {
      return axios.create({
        baseURL: appConfig.erpnext.baseUrl,
        headers: {
          Authorization: `token ${credential.apiKey}:${credential.apiSecret}`,
          "Content-Type": "application/json",
        },
        timeout: timeoutMs,
      });
    }
    throw new Error(`Unknown credential mode: ${credential.mode}`);
  }

  async loginWithPassword(identifier: string, password: string): Promise<UserCredential> {
    const res = await axios.post(
      `${appConfig.erpnext.baseUrl}/api/method/login`,
      new URLSearchParams({ usr: identifier, pwd: password }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const setCookie = res.headers["set-cookie"] || [];
    const sidCookie = setCookie.find((c: string) => c.startsWith("sid="));
    const sid = sidCookie?.split(";")[0]?.split("=")[1];
    if (!sid) throw new Error("ERPNext login succeeded but no session cookie was returned");

    return { mode: "session", sid };
  }

  async loginWithApiKey(identifier: string, apiKey: string, apiSecret: string): Promise<UserCredential> {
    // Validate the key actually belongs to this identifier before
    // trusting it — otherwise anyone with any valid key/secret pair
    // could claim to be any user by typing a different email.
    const res = await axios.get(`${appConfig.erpnext.baseUrl}/api/method/frappe.auth.get_logged_user`, {
      headers: { Authorization: `token ${apiKey}:${apiSecret}` },
    });
    const actualUser = res.data.message;
    if (actualUser !== identifier) {
      throw new Error("This API key belongs to a different ERPNext user than the one entered");
    }
    return { mode: "api_key", apiKey, apiSecret };
  }

  async getUserRoles(identifier: string): Promise<string[]> {
    // Privileged introspection, not a business transaction — using the
    // service account here is intentional and documented.
    const res = await erpnextClient.get(`/api/method/frappe.client.get_list`, {
      params: {
        doctype: "Has Role",
        filters: JSON.stringify([["parent", "=", identifier]]),
        fields: JSON.stringify(["role"]),
        limit_page_length: 0,
      },
    });
    return (res.data.message || []).map((r: any) => r.role);
  }

  // ERPNext's own full-access roles. "System Manager" already resolves
  // to "*" in roles.policy.ts (every tool this app knows about), but
  // that only decides which TOOLS are callable — ERPNext's real DocPerm
  // per doctype is a separate, narrower layer underneath it and can
  // still say no (confirmed live 2026-08-16: a System-Manager-only user
  // got real 403s on Payroll Entry/Sales Invoice/GL Entry). This is what
  // auth/erpnextAuth.ts checks to decide whether to stamp
  // credential.fullAccess, which clientFor()'s read-only branch above
  // acts on. "Administrator" included for completeness even though this
  // deployment's demo users never carry it.
  private static readonly FULL_ACCESS_ROLES = new Set(["System Manager", "Administrator"]);

  isFullAccessRole(roles: string[]): boolean {
    return roles.some((r) => ErpNextConnector.FULL_ACCESS_ROLES.has(r));
  }

  // getCompanyName() is called on every chat turn (reasoningEngine.ts
  // injects it into the system prompt), so it's cached process-wide for
  // an hour rather than re-fetched per turn — a company name changing
  // mid-session is not a scenario worth paying a round trip for on
  // every message. Deliberately module-scoped state, not per-instance:
  // there is exactly one ErpNextConnector per process (see
  // config/system.config.ts) and exactly one company name for it.
  private static companyNameCache: { value: string | null; fetchedAt: number } | null = null;
  private static readonly COMPANY_NAME_TTL_MS = 60 * 60 * 1000;

  async getCompanyName(): Promise<string | null> {
    const cached = ErpNextConnector.companyNameCache;
    if (cached && Date.now() - cached.fetchedAt < ErpNextConnector.COMPANY_NAME_TTL_MS) {
      return cached.value;
    }
    let value: string | null = null;
    try {
      // Multi-company ERPNext deployments exist, but this agent (like
      // its role/tool model generally) is built for the single-company
      // case — the first Company record is a reasonable best-effort,
      // not a promise of picking the "default" one in a multi-company
      // setup. Privileged introspection, same service-account
      // justification as getUserRoles above.
      const rows = await getDocList(
        "Company",
        { fields: JSON.stringify(["company_name"]), limit_page_length: 1 },
        erpnextClient
      );
      value = rows[0]?.company_name || null;
    } catch (err) {
      console.warn(`[erpnextConnector] getCompanyName() failed, continuing without it: ${(err as Error).message}`);
    }
    ErpNextConnector.companyNameCache = { value, fetchedAt: Date.now() };
    return value;
  }

  async list(entityKey: string, credential: UserCredential, params?: { filters?: Record<string, any>; limit?: number; offset?: number; sortBy?: string; sortDir?: "asc" | "desc" }): Promise<any[]> {
    const mapping = ERPNEXT_ENTITY_MAP[entityKey];
    const client = this.clientFor(credential, undefined, { read: true });
    const nativeFilters = params?.filters ? toNativeFilters(entityKey, params.filters) : undefined;
    const nativeSortField = params?.sortBy ? mapping.fieldMap[params.sortBy] : undefined;
    if (params?.sortBy && !nativeSortField) {
      console.warn(`[erpnextConnector] "${params.sortBy}" has no native mapping for "${entityKey}" — sortBy ignored`);
    }
    // "name" (this doctype's real primary key) is ALWAYS appended as a
    // secondary sort key — confirmed live: two identical calls (same
    // entity/filters/limit, no sortBy given) returned two DIFFERENT sets
    // of matching rows a few messages apart in the same conversation
    // ("4 quotations" that weren't the same 4 quotations). Root cause:
    // with no order_by, ERPNext falls back to its own default (typically
    // "modified desc"), and erpdatabuild's bulk-generated records share
    // near-identical/identical "modified" timestamps — a tie with no
    // deterministic tiebreaker means which rows land inside a LIMIT is
    // not guaranteed stable across separate query executions. "name" is
    // unique per row by construction, so appending it as a tiebreaker
    // costs nothing when the primary sort already disambiguates, and
    // makes every list() call fully deterministic when it doesn't.
    const orderBy = nativeSortField
      ? `${nativeSortField} ${params?.sortDir || "desc"}, name asc`
      : "modified desc, name asc";
    // Default page size is an admin setting (settingsService "list_page_size",
    // seeded to 25 — see db/migrations/015_pagination_settings.sql), not a
    // hardcoded constant — was a flat 100 before. Two real problems with
    // that: (1) 100 rows of real field data is a lot of tokens to hand the
    // LLM on every plain "show me X" ask, most of which never get read past
    // the first handful; (2) it's WAY above Frappe's own default page size
    // (20, confirmed in Frappe's own REST docs) with no product reason for
    // the gap. Model still asks for a bigger page explicitly (params.limit)
    // or pages forward with offset when the user actually wants more — see
    // the SYSTEM_PROMPT pagination rule in reasoningEngine.ts.
    const defaultLimit = await settingsService.get("list_page_size", 25);
    const rows = await getDocList(
      mapping.doctype,
      {
        fields: JSON.stringify(nativeFields(entityKey)),
        filters: nativeFilters ? JSON.stringify(Object.entries(nativeFilters).map(([k, v]) => toFilterTriple(k, v))) : undefined,
        limit_page_length: params?.limit || defaultLimit,
        limit_start: params?.offset || 0,
        order_by: orderBy,
      },
      client
    );
    return rows.map((row: any) => toCanonicalRow(entityKey, row));
  }

  // Customer/Supplier's own phone/email fields (mobile_no/email_id) are
  // Read Only mirrors ERPNext computes from the linked primary Contact -
  // and in this deployment's data they were never populated, because
  // erpdatabuild links customer_primary_contact/supplier_primary_contact
  // via a raw frappe.db.set_value (bypassing the controller hook that
  // would normally sync the mirror). Confirmed live 2026-08-09: 0 of 140
  // Customers, 0 of 70 Suppliers have mobile_no/email_id set, while the
  // linked Contact itself genuinely has real phone/email data (see
  // entityMaps/crm.ts's contact.phone fix, same session). Rather than
  // permanently show blank, get() (not list() - this is a single extra
  // lookup, fine for one record, not for a whole page of them) falls
  // back to the primary Contact's real phone/email when the header
  // field is empty.
  private static readonly PRIMARY_CONTACT_FIELD: Record<string, string> = {
    customer: "customer_primary_contact",
    supplier: "supplier_primary_contact",
  };

  private async backfillPrimaryContactInfo(entityKey: string, canonical: Record<string, any>, nativeRow: Record<string, any>, credential: UserCredential): Promise<void> {
    const linkField = ErpNextConnector.PRIMARY_CONTACT_FIELD[entityKey];
    const contactId = linkField && nativeRow[linkField];
    if (!contactId) return;
    try {
      const contact = await getDoc("Contact", contactId, this.clientFor(credential, undefined, { read: true }));
      if (!canonical.phone) canonical.phone = contact.phone || contact.mobile_no || undefined;
      if (!canonical.email) canonical.email = contact.email_id || undefined;
    } catch {
      // Primary contact missing/inaccessible - leave phone/email blank
      // rather than fail the whole customer/supplier fetch over it.
    }
  }

  /**
   * Employee's "email" canonical field already maps directly to
   * "user_id" (see entityMaps/hr.ts — its value already IS the real
   * email, no lookup needed). Phone has no equivalent shortcut: it lives
   * on the linked User's own "mobile_no", not any field on Employee
   * itself (Employee's own cell_number/company_email are confirmed 0/96
   * populated in this dataset). Same get()-only-not-list() cost
   * reasoning as backfillPrimaryContactInfo above — one extra lookup per
   * record is fine, a whole page of them is not.
   */
  private async backfillEmployeePhone(canonical: Record<string, any>, nativeRow: Record<string, any>, credential: UserCredential): Promise<void> {
    const userId = nativeRow.user_id;
    if (!userId || canonical.phone) return;
    try {
      const user = await getDoc("User", userId, this.clientFor(credential, undefined, { read: true }));
      canonical.phone = user.mobile_no || user.phone || undefined;
    } catch {
      // Linked user missing/inaccessible - leave phone blank rather than
      // fail the whole employee fetch over it.
    }
  }

  async get(entityKey: string, credential: UserCredential, id: string): Promise<any> {
    const mapping = ERPNEXT_ENTITY_MAP[entityKey];
    const row = await getDoc(mapping.doctype, id, this.clientFor(credential, undefined, { read: true }));
    const canonical = toCanonicalRow(entityKey, row);
    if ((entityKey === "customer" || entityKey === "supplier") && (!canonical.phone || !canonical.email)) {
      await this.backfillPrimaryContactInfo(entityKey, canonical, row, credential);
    }
    if (entityKey === "employee") {
      await this.backfillEmployeePhone(canonical, row, credential);
    }
    return canonical;
  }

  async create(entityKey: string, credential: UserCredential, canonicalData: Record<string, any>): Promise<any> {
    const mapping = ERPNEXT_ENTITY_MAP[entityKey];
    const nativeData = toNativeData(entityKey, canonicalData);
    const row = await createDoc(mapping.doctype, { doctype: mapping.doctype, ...nativeData }, this.clientFor(credential));
    return toCanonicalRow(entityKey, row);
  }

  async update(entityKey: string, credential: UserCredential, id: string, canonicalData: Record<string, any>): Promise<any> {
    const mapping = ERPNEXT_ENTITY_MAP[entityKey];
    const nativeData = toNativeData(entityKey, canonicalData);
    const row = await updateDoc(mapping.doctype, id, nativeData, this.clientFor(credential));
    return toCanonicalRow(entityKey, row);
  }

  // Row cap for aggregate() below. Under this, a plain fetch-and-reduce is
  // cheap and simple — and, unlike pushing SUM/AVG into ERPNext-specific
  // SQL, this same reduce logic works unchanged for a future SapConnector.
  // OVER this, aggregate() no longer just warns and returns a possible
  // undercount (see count()'s own doc comment in core/types.ts and the
  // date-range chunking below) — this cap now only decides "fetch in one
  // shot" vs. "bisect into exact chunks first", never "give up and hope
  // the number is close enough".
  private static readonly AGGREGATE_ROW_CAP = 10000;

  /** Exact, zero-row-fetch count via ERPNext's own frappe.client.get_count
   *  whitelisted method — the same mechanism Frappe's own list views use
   *  to show "975 of 975" without paging through every row. See this
   *  method's own doc comment on SystemConnector (core/types.ts) for why
   *  it exists as its own connector method, not just an aggregate() detail. */
  async count(entityKey: string, credential: UserCredential, filters?: Record<string, any>): Promise<number> {
    const mapping = ERPNEXT_ENTITY_MAP[entityKey];
    const client = this.clientFor(credential, undefined, { read: true });
    const nativeFilters = filters ? toNativeFilters(entityKey, filters) : undefined;
    const result = await callMethod<number | string>(
      "frappe.client.get_count",
      {
        doctype: mapping.doctype,
        filters: nativeFilters ? JSON.stringify(Object.entries(nativeFilters).map(([k, v]) => toFilterTriple(k, v))) : undefined,
      },
      client
    );
    return Number(result) || 0;
  }

  /** One leaf fetch-and-fold — the same "get real rows, reduce locally"
   *  shape aggregate() always used, just extracted so it can be called
   *  once per date-range chunk (see aggregateChunked below) as well as
   *  for the plain, under-the-cap case. Folds every row into a combinable
   *  partial state (sum/count/min/max) rather than a single "value",
   *  because chunk results have to be MERGED afterward, not just
   *  returned — see combineAggregateState's own doc comment. */
  private async fetchAndFoldAggregate(
    entityKey: string,
    filters: Record<string, any> | undefined,
    nativeField: string | undefined,
    nativeGroupBy: string | undefined,
    client: AxiosInstance
  ): Promise<{ overall: AggregateState; groups: Map<string, AggregateState> }> {
    const mapping = ERPNEXT_ENTITY_MAP[entityKey];
    const nativeFilters = filters ? toNativeFilters(entityKey, filters) : undefined;
    const fields = new Set<string>(["name"]);
    if (nativeField) fields.add(nativeField);
    if (nativeGroupBy) fields.add(nativeGroupBy);
    const rows = await getDocList(
      mapping.doctype,
      {
        fields: JSON.stringify([...fields]),
        filters: nativeFilters ? JSON.stringify(Object.entries(nativeFilters).map(([k, v]) => toFilterTriple(k, v))) : undefined,
        limit_page_length: ErpNextConnector.AGGREGATE_ROW_CAP,
      },
      client
    );
    const overall = emptyAggregateState();
    const groups = new Map<string, AggregateState>();
    for (const row of rows) {
      // For op:"count", nativeField is undefined and every row folds in as
      // a plain "1" — only state.count is ever read back for that op, so
      // sum/min/max being meaningless in that case is harmless.
      const n = nativeField ? Number(row[nativeField]) : 1;
      if (nativeField && Number.isNaN(n)) continue;
      foldAggregateRow(overall, n);
      if (nativeGroupBy) {
        const key = row[nativeGroupBy] ?? "(none)";
        if (!groups.has(key)) groups.set(key, emptyAggregateState());
        foldAggregateRow(groups.get(key)!, n);
      }
    }
    return { overall, groups };
  }

  /** Recursively bisects [start, end] until each chunk's real row count
   *  (checked via the cheap count() pre-check, not a fetch) is under the
   *  cap, fetch-and-folds each leaf chunk, and merges every chunk's
   *  partial state back together — exactly the "split 2 years into 8
   *  quarters, sum for a real total" approach asked for, generalized to
   *  bisect however finely a given filtered population actually needs
   *  rather than a fixed quarter-sized step (a population could be dense
   *  enough to need finer splits, or sparse enough to need none at all). */
  private async aggregateChunked(
    entityKey: string,
    credential: UserCredential,
    nativeField: string | undefined,
    nativeGroupBy: string | undefined,
    filters: Record<string, any> | undefined,
    dateKey: string,
    start: string,
    end: string,
    client: AxiosInstance
  ): Promise<{ overall: AggregateState; groups: Map<string, AggregateState> }> {
    const chunkFilters = withDateRange(filters, dateKey, start, end);
    const chunkCount = await this.count(entityKey, credential, chunkFilters);
    if (chunkCount <= ErpNextConnector.AGGREGATE_ROW_CAP || start === end) {
      // start === end means a single day alone exceeds the cap — nothing
      // finer to bisect into; fetch what the cap allows rather than loop
      // forever. Real deployments are nowhere near this dense per day,
      // but this is the correct, bounded fallback if one ever were.
      return this.fetchAndFoldAggregate(entityKey, chunkFilters, nativeField, nativeGroupBy, client);
    }
    const halves = bisectDateRange(start, end);
    if (!halves) return this.fetchAndFoldAggregate(entityKey, chunkFilters, nativeField, nativeGroupBy, client);
    const [[s1, e1], [s2, e2]] = halves;
    const [a, b] = await Promise.all([
      this.aggregateChunked(entityKey, credential, nativeField, nativeGroupBy, filters, dateKey, s1, e1, client),
      this.aggregateChunked(entityKey, credential, nativeField, nativeGroupBy, filters, dateKey, s2, e2, client),
    ]);
    const overall = combineAggregateState(a.overall, b.overall);
    const groups = new Map(a.groups);
    for (const [key, state] of b.groups) {
      groups.set(key, groups.has(key) ? combineAggregateState(groups.get(key)!, state) : state);
    }
    return { overall, groups };
  }

  async aggregate(
    entityKey: string,
    credential: UserCredential,
    params: { field?: string; op: "sum" | "avg" | "count" | "min" | "max" | "median" | "variance" | "stddev"; filters?: Record<string, any>; groupBy?: string }
  ): Promise<{ overall: { value: number; count: number }; groups?: { key: string; value: number; count: number }[] }> {
    const mapping = ERPNEXT_ENTITY_MAP[entityKey];
    const client = this.clientFor(credential, undefined, { read: true });

    const nativeField = params.op === "count" ? undefined : mapping.fieldMap[params.field || ""];
    if (params.op !== "count" && !nativeField) {
      // Confirmed live 2026-08-12: "total"/"amount" both guessed wrong for
      // expense_claim (the real fields are total_claimed_amount/
      // total_sanctioned_amount) — same "point the retry at the real
      // answer instead of a doc file to go re-read" fix as
      // toNativeFilters' own error above.
      //
      // Confirmed live 2026-08-12: "highest paid employee" retried
      // entityKey:"employee" with field "salary", then "ctc", then
      // "net_pay" — three separate failed attempts, all the same root
      // mistake. Employee genuinely has none of these (compensation is
      // computed/stored on the linked Salary Structure Assignment/Salary
      // Slip records, not Employee itself) — the generic "here are the
      // real canonical fields" message is technically correct but never
      // points at the entity that actually HAS the data, so the model
      // just kept guessing new field names on the same wrong entity
      // instead of switching entities. A narrow, targeted redirect for
      // this one well-known confusion, same "point at the real answer"
      // philosophy as the fix above.
      throw new Error(buildNoNativeFieldMappingError(entityKey, params.field, Object.keys(mapping.fieldMap)));
    }
    const nativeGroupBy = params.groupBy ? mapping.fieldMap[params.groupBy] : undefined;
    if (params.groupBy && !nativeGroupBy) {
      console.warn(`[erpnextConnector] groupBy "${params.groupBy}" has no native mapping for "${entityKey}" — ignored`);
    }

    // Confirmed 2026-08-14: a KPI-dashboard prompt asked for median/
    // variance-style spread alongside total/average — analytics.aggregate
    // only had sum/avg/count/min/max, so there was no real, exact way to
    // answer "median deal size" or "how spread out are our deal sizes"
    // without the model estimating from a raw list (exactly the
    // eyeballing failure mode every other op here already exists to
    // prevent). Added via the same shared, pure calculator statsCalculator.ts
    // uses for analytics.calculate — one real implementation of the math,
    // not two copies that could drift.
    //
    // These three ops are NOT algebraically decomposable across chunks
    // the way sum/count/min/max are (a median or variance of the whole
    // population can't be derived from N chunks' own medians/variances) —
    // still capped-and-warned rather than exactly chunked, same as
    // before. Not currently reachable from the LLM anyway (analytics.
    // aggregate's own tool schema only exposes sum/avg/count/min/max —
    // see modules/analytics/index.ts) but kept correct for direct callers.
    if (params.op === "median" || params.op === "variance" || params.op === "stddev") {
      const nativeFilters = params.filters ? toNativeFilters(entityKey, params.filters) : undefined;
      const fields = new Set<string>(["name"]);
      if (nativeField) fields.add(nativeField);
      if (nativeGroupBy) fields.add(nativeGroupBy);
      const rows = await getDocList(
        mapping.doctype,
        {
          fields: JSON.stringify([...fields]),
          filters: nativeFilters ? JSON.stringify(Object.entries(nativeFilters).map(([k, v]) => toFilterTriple(k, v))) : undefined,
          limit_page_length: ErpNextConnector.AGGREGATE_ROW_CAP,
        },
        client
      );
      if (rows.length === ErpNextConnector.AGGREGATE_ROW_CAP) {
        console.warn(`[erpnextConnector] aggregate() op:"${params.op}" on "${entityKey}" hit the ${ErpNextConnector.AGGREGATE_ROW_CAP}-row cap — result may be a partial-data undercount, narrow the filters for an exact number`);
      }
      const reduce = (group: any[]): { value: number; count: number } => {
        const nums = group.map((r) => Number(r[nativeField!])).filter((n) => !Number.isNaN(n));
        if (nums.length === 0) return { value: 0, count: 0 };
        return { value: computeStatsOp(params.op as StatsOp, nums), count: nums.length };
      };
      if (!nativeGroupBy) return { overall: reduce(rows) };
      const groups = new Map<string, any[]>();
      for (const row of rows) {
        const key = row[nativeGroupBy] ?? "(none)";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      }
      return { overall: reduce(rows), groups: [...groups.entries()].map(([key, group]) => ({ key, ...reduce(group) })) };
    }

    // sum/avg/count/min/max ARE decomposable — combineAggregateState below
    // merges partial per-chunk state exactly, no approximation. count()
    // is the cheap pre-check: real deployments almost always land under
    // the cap here and take the single fetch-and-fold path below, same
    // cost as before (one count() call is far cheaper than a fetch, so
    // this adds one small round trip, not a second full data pull).
    const totalCount = await this.count(entityKey, credential, params.filters);

    // A bare op:"count" with no groupBy needs nothing beyond the number
    // count() just returned — no row fetch, no folding, no chunking, at
    // ANY population size (get_count is already exact and unbounded, it
    // doesn't hit AGGREGATE_ROW_CAP the way a row fetch does). Every other
    // op still needs real row values (sum/avg/min/max) or a per-group
    // breakdown (any op + groupBy), so only this one shape short-circuits.
    if (params.op === "count" && !nativeGroupBy) {
      return { overall: { value: totalCount, count: totalCount } };
    }

    let overall: AggregateState;
    let groups: Map<string, AggregateState> | undefined;

    if (totalCount <= ErpNextConnector.AGGREGATE_ROW_CAP) {
      const r = await this.fetchAndFoldAggregate(entityKey, params.filters, nativeField, nativeGroupBy, client);
      overall = r.overall;
      groups = nativeGroupBy ? r.groups : undefined;
    } else {
      const dateRange = findDateRangeFilter(params.filters);
      if (!dateRange) {
        // No date-shaped filter to bisect on — there's no safe dimension
        // to split a non-temporal filter into smaller exact chunks along,
        // so this is the one case that still falls back to the old
        // capped-fetch-and-warn behavior (directionally correct, flagged
        // as possibly partial, not silently wrong).
        console.warn(
          `[erpnextConnector] aggregate() on "${entityKey}" matches ${totalCount} rows (over the ${ErpNextConnector.AGGREGATE_ROW_CAP}-row cap) ` +
          `and has no date-range filter to chunk on — result is capped at ${ErpNextConnector.AGGREGATE_ROW_CAP} rows and may undercount; ` +
          `add a date filter or narrow the query for an exact total`
        );
        const r = await this.fetchAndFoldAggregate(entityKey, params.filters, nativeField, nativeGroupBy, client);
        overall = r.overall;
        groups = nativeGroupBy ? r.groups : undefined;
      } else {
        const r = await this.aggregateChunked(
          entityKey, credential, nativeField, nativeGroupBy, params.filters, dateRange.key, dateRange.start, dateRange.end, client
        );
        overall = r.overall;
        groups = nativeGroupBy ? r.groups : undefined;
      }
    }

    const finalize = (s: AggregateState) => ({ value: finalizeAggregateValue(params.op as "sum" | "avg" | "count" | "min" | "max", s), count: s.count });
    if (!groups) return { overall: finalize(overall) };
    return { overall: finalize(overall), groups: [...groups.entries()].map(([key, s]) => ({ key, ...finalize(s) })) };
  }

  async runReport(reportKey: string, credential: UserCredential, filters?: Record<string, any>): Promise<any[]> {
    const mapping = ERPNEXT_REPORT_MAP[reportKey];
    if (!mapping) throw new Error(`No ERPNext report mapping for "${reportKey}"`);

    const nativeFilters: Record<string, any> = { ...mapping.defaultFilters };
    for (const [canonical, value] of Object.entries(filters || {})) {
      const native = mapping.filterFieldMap[canonical];
      if (native) nativeFilters[native] = value;
    }

    // 45s, not the default 15s — see clientFor()'s doc comment. Report
    // generation (esp. accounting reports recomputing GL entries) is
    // heavier than a plain list/get, and a comparison prompt calls this
    // more than once per turn.
    const client = this.clientFor(credential, 45000, { read: true });

    // Belt-and-suspenders only — the actual root cause of "I can't
    // access the P&L report right now" (chased live 2026-08-12) turned
    // out to be a malformed-tool-call shape, fixed at the source in
    // reportModuleFactory.ts's normalizeReportArgs(). This retry just
    // covers genuine network-ish hiccups (a real ERPNext restart mid-
    // request, a dropped connection) so they don't surface as a user-
    // facing failure either. Deliberately narrow — does NOT retry on
    // "mandatory"-type validation errors anymore, since after the real
    // fix those mean the caller genuinely omitted a required filter,
    // and masking that with a retry would just waste 2 extra round
    // trips before failing anyway.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await client.post("/api/method/frappe.desk.query_report.run", {
          report_name: mapping.reportName,
          filters: nativeFilters,
        });
        return this.normalizeReportResult(res.data.message);
      } catch (err: any) {
        lastErr = err;
        const upstreamMsg = err?.response?.data?.exception || err?.message || "";
        const looksTransient = /please try again|timeout|ECONNRESET|ECONNREFUSED|socket hang up/i.test(upstreamMsg);
        if (attempt < 2 && looksTransient) {
          console.warn(`[erpnextConnector] runReport("${reportKey}") attempt ${attempt + 1} hit a transient-looking error, retrying:`, upstreamMsg);
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async getDocumentPdf(entityKey: string, credential: UserCredential, id: string): Promise<{ filename: string; contentType: string; buffer: Buffer }> {
    const mapping = ERPNEXT_ENTITY_MAP[entityKey];
    if (!mapping) throw new Error(`No ERPNext entity mapping for "${entityKey}"`);
    const client = this.clientFor(credential, undefined, { read: true });
    // frappe.utils.print_format.download_pdf: the same PDF generation
    // ERPNext's own "Print" / "Download PDF" desk button calls — the
    // user's own permissions on this doctype/record apply exactly as
    // they would clicking that button themselves, since this request
    // carries their real credential, never a service account.
    const res = await client.get("/api/method/frappe.utils.print_format.download_pdf", {
      params: { doctype: mapping.doctype, name: id, no_letterhead: 0 },
      responseType: "arraybuffer",
    });
    return {
      filename: `${id}.pdf`,
      contentType: (res.headers["content-type"] as string) || "application/pdf",
      buffer: Buffer.from(res.data),
    };
  }

  /** ERPNext's report output shape varies (columns as strings vs
   *  objects, result as row-arrays vs already-dicts) depending on
   *  report type/version — best-effort normalization to array-of-
   *  objects. Adjust here if a specific report doesn't match. */
  private normalizeReportResult(message: any): any[] {
    if (!message || !Array.isArray(message.result)) return [];
    const { columns, result } = message;

    if (result.length && !Array.isArray(result[0])) {
      return result; // already array of dicts
    }

    const keys = (columns || []).map((c: any) =>
      typeof c === "string" ? c.split(":")[0] : c.fieldname || c.label || "value"
    );
    return result.map((row: any[]) => {
      const obj: Record<string, any> = {};
      keys.forEach((k: string, i: number) => (obj[k] = row[i]));
      return obj;
    });
  }
}

/** A filter value is either a raw value (implicit "=") or an explicit
 *  { op, value } pair — lets callers ask for "like"/"in"/range filters
 *  instead of everything silently collapsing to an exact match.
 *  "between" (value is a 2-element [start, end] array) is a native
 *  Frappe filter operator — added 2026-08-09 after confirming live that
 *  a "last week" query had no way to express a two-sided date range
 *  with only >="/"<=" available (one op per field key): the model could
 *  only ever pick ONE bound, so it used "<=" alone and matched every
 *  quotation back to the start of the dataset instead of a real 7-day
 *  window. "relative" (value is one of core/relativePeriods.ts's fixed
 *  keywords, e.g. "last_week") is resolved into that same "between"
 *  shape below via resolveRelativePeriod() — added the same day after
 *  confirming "between" alone still wasn't reliably reached for; see
 *  that file's doc comment for why letting the model do date arithmetic
 *  itself (even with anchors to copy) isn't the fix. */
export type FilterOp = "=" | "!=" | "like" | "in" | ">" | "<" | ">=" | "<=" | "between" | "relative";

// The LLM sees the { op, value } contract documented on every list tool
// (see entityModuleFactory.ts), but occasionally reaches for Mongo-style
// operator keys anyway (training-data habit) — {"$like": "..."} instead
// of {"op": "like", "value": "..."}. Left unhandled, that object doesn't
// match the "op" in raw check below, so it falls through to an exact-
// match against the whole broken object and silently returns nothing —
// confirmed live via interaction_log: a "customer starts with Shree"
// search failed exactly this way. Normalize the common aliases instead
// of just documenting the contract and hoping.
const MONGO_STYLE_OP_ALIASES: Record<string, FilterOp> = {
  $eq: "=", $ne: "!=", $like: "like", $regex: "like", $in: "in",
  $gt: ">", $lt: "<", $gte: ">=", $lte: "<=",
};

// Confirmed live 2026-08-12 (pm2 error log): leave_application.list /
// leave_allocation.list both crashed with a raw Frappe-side
// "KeyError: 'greater_than_equal'" — the model sent the documented
// {"op": "...", "value": ...} shape correctly, but spelled the operator
// out in words ("greater_than_equal") instead of using the ">="/"<="
// symbols the contract actually specifies. That went straight through
// toFilterTriple's "op" in raw branch uncast/unvalidated, straight into
// ERPNext's own filter engine, which doesn't recognize word-form
// operators and throws its own unhandled KeyError back at the user
// instead of a clean app-level message. Normalize the common word forms
// the same way MONGO_STYLE_OP_ALIASES normalizes $-prefixed ones.
const WORD_STYLE_OP_ALIASES: Record<string, FilterOp> = {
  greater_than_equal: ">=", greater_than_equals: ">=", greater_or_equal: ">=",
  less_than_equal: "<=", less_than_equals: "<=", less_or_equal: "<=",
  greater_than: ">", less_than: "<",
  equal: "=", equals: "=", not_equal: "!=", not_equals: "!=",
  contains: "like",
};

const VALID_FILTER_OPS = new Set<FilterOp>(["=", "!=", "like", "in", ">", "<", ">=", "<=", "between", "relative"]);

// Confirmed live 2026-08-12: {"op":"like","value":"Sai Controls"} against
// a real customer named "Sai Controls LLP" returned ZERO rows. Root
// cause: ERPNext's REST API "like" operator does NOT auto-wrap the value
// with SQL wildcards — a caller has to include the "%" itself (e.g.
// "%Sai Controls%"), or a plain "like" filter behaves as an exact match,
// same as "=". The model was never told this and never adds them itself
// (its own tool-description contract just says {"op":"like","value":
// "..."} — see entityModuleFactory.ts), so every "like" filter across
// every entity in this app has silently been an exact-match-only filter
// this whole time. Fixed centrally, here, rather than relying on the
// model to remember — a substring search is exactly what "like" means to
// a user typing a partial name, and should just work that way.
function wrapLikeWildcards(op: FilterOp, value: any): any {
  if (op !== "like" || typeof value !== "string" || value.includes("%")) return value;
  return `%${value}%`;
}

export function toFilterTriple(field: string, raw: any): [string, FilterOp, any] {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if ("op" in raw) {
      if (raw.op === "relative") {
        const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        return [field, "between", resolveRelativePeriod(raw.value, todayIso)];
      }
      const normalizedOp = WORD_STYLE_OP_ALIASES[raw.op] ?? (raw.op as FilterOp);
      if (!VALID_FILTER_OPS.has(normalizedOp)) {
        throw new Error(
          `Unknown filter operator "${raw.op}" for field "${field}" — must be one of: ` +
          `=, !=, like, in, >, <, >=, <=, between, relative.`
        );
      }
      return [field, normalizedOp, wrapLikeWildcards(normalizedOp, raw.value)];
    }
    for (const [alias, op] of Object.entries(MONGO_STYLE_OP_ALIASES)) {
      if (alias in raw) return [field, op, wrapLikeWildcards(op, raw[alias])];
    }
  }
  return [field, "=", raw];
}

// --- aggregate() date-range chunking helpers -------------------------------
//
// Combinable partial-aggregate state, one instance per chunk (or per group
// within a chunk). sum/count/min/max are each simple to merge across
// chunks (sum of sums, sum of counts, min of mins, max of maxes) — avg is
// derived from sum/count at the very end, never itself carried as a
// running average (averaging two chunk-averages together would silently
// weight a 3-row chunk the same as a 3000-row one, a real correctness bug
// this shape avoids by construction).
interface AggregateState {
  sum: number;
  count: number;
  min: number;
  max: number;
}

function emptyAggregateState(): AggregateState {
  return { sum: 0, count: 0, min: Infinity, max: -Infinity };
}

function foldAggregateRow(state: AggregateState, n: number): void {
  state.sum += n;
  state.count += 1;
  if (n < state.min) state.min = n;
  if (n > state.max) state.max = n;
}

function combineAggregateState(a: AggregateState, b: AggregateState): AggregateState {
  return {
    sum: a.sum + b.sum,
    count: a.count + b.count,
    min: Math.min(a.min, b.min),
    max: Math.max(a.max, b.max),
  };
}

function finalizeAggregateValue(op: "sum" | "avg" | "count" | "min" | "max", state: AggregateState): number {
  switch (op) {
    case "sum": return state.sum;
    case "avg": return state.count ? state.sum / state.count : 0;
    case "count": return state.count;
    case "min": return state.count ? state.min : 0;
    case "max": return state.count ? state.max : 0;
  }
}

/** Scans a CANONICAL filters object (before toNativeFilters) for the
 *  first date-range-shaped condition — {"op":"between","value":[start,end]}
 *  or {"op":"relative","value":"..."} (resolved via the same
 *  resolveRelativePeriod every plain filter already uses). This is the
 *  dimension aggregateChunked bisects along; a filter with neither shape
 *  (a plain "=" status, a "like" name, no date condition at all) means
 *  there's nothing safe to split on, so aggregate() falls back to the
 *  capped-and-warned path instead of guessing at a chunking strategy. */
function findDateRangeFilter(filters?: Record<string, any>): { key: string; start: string; end: string } | null {
  if (!filters) return null;
  for (const [key, raw] of Object.entries(filters)) {
    if (raw && typeof raw === "object" && !Array.isArray(raw) && "op" in raw) {
      if (raw.op === "between" && Array.isArray(raw.value) && raw.value.length === 2) {
        return { key, start: raw.value[0], end: raw.value[1] };
      }
      if (raw.op === "relative") {
        const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const [start, end] = resolveRelativePeriod(raw.value, todayIso);
        return { key, start, end };
      }
    }
  }
  return null;
}

function withDateRange(filters: Record<string, any> | undefined, key: string, start: string, end: string): Record<string, any> {
  return { ...(filters || {}), [key]: { op: "between", value: [start, end] } };
}

/** Splits an ISO [start, end] date range in half by day count, e.g. two
 *  years -> two ~1-year halves -> four ~6-month quarters -> ... — as many
 *  levels deep as the actual matching-row density needs (aggregateChunked
 *  only recurses into a half when its own count() is still over the cap),
 *  never a fixed "always split into exactly 8 quarters" step. Returns null
 *  when the range can't be split further (start === end, or already a
 *  single day) — the caller falls back to a bounded, capped fetch for
 *  that final sliver. */
function bisectDateRange(start: string, end: string): [[string, string], [string, string]] | null {
  if (start >= end) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const totalDays = Math.round((endMs - startMs) / 86400000);
  if (totalDays < 1) return null;
  const midMs = startMs + Math.floor(totalDays / 2) * 86400000;
  const midIso = new Date(midMs).toISOString().slice(0, 10);
  const nextDayIso = new Date(midMs + 86400000).toISOString().slice(0, 10);
  if (midIso < start || nextDayIso > end) return null;
  return [[start, midIso], [nextDayIso, end]];
}
