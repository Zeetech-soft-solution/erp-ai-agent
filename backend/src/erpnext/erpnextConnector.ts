import axios, { AxiosInstance } from "axios";
import { SystemConnector, UserCredential } from "../core/types";
import erpnextClient, { getDocList, getDoc, createDoc, updateDoc } from "./client";
import { appConfig } from "../config/app.config";
import { ERPNEXT_ENTITY_MAP, nativeFields, toNativeData, toCanonicalRow } from "./entityMap";
import { ERPNEXT_REPORT_MAP } from "./reportMap";

/**
 * ERPNext's implementation of the ERP-agnostic connector contract.
 * This is the ONLY file in the codebase that knows ERPNext speaks REST
 * at /api/resource/<doctype>, that impersonation means either a
 * `sid` session cookie or a personal `token <key>:<secret>` header, or
 * that roles live in the "Has Role" child doctype. A future
 * SapConnector implementing the same interface knows none of this.
 */
export class ErpNextConnector implements SystemConnector {
  /** Builds a per-request axios client authenticated AS the given
   *  person — never the shared service account — so every list/get/
   *  create/update below acts, and gets audited in ERPNext, as them. */
  private clientFor(credential: UserCredential): AxiosInstance {
    if (credential.mode === "session") {
      return axios.create({
        baseURL: appConfig.erpnext.baseUrl,
        headers: { Cookie: `sid=${credential.sid}`, "Content-Type": "application/json" },
        timeout: 15000,
      });
    }
    if (credential.mode === "api_key") {
      return axios.create({
        baseURL: appConfig.erpnext.baseUrl,
        headers: {
          Authorization: `token ${credential.apiKey}:${credential.apiSecret}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
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

  async list(entityKey: string, credential: UserCredential, params?: { filters?: Record<string, any>; limit?: number; offset?: number; sortBy?: string; sortDir?: "asc" | "desc" }): Promise<any[]> {
    const mapping = ERPNEXT_ENTITY_MAP[entityKey];
    const client = this.clientFor(credential);
    const nativeFilters = params?.filters ? toNativeData(entityKey, params.filters) : undefined;
    const nativeSortField = params?.sortBy ? mapping.fieldMap[params.sortBy] : undefined;
    if (params?.sortBy && !nativeSortField) {
      console.warn(`[erpnextConnector] "${params.sortBy}" has no native mapping for "${entityKey}" — sortBy ignored`);
    }
    const rows = await getDocList(
      mapping.doctype,
      {
        fields: JSON.stringify(nativeFields(entityKey)),
        filters: nativeFilters ? JSON.stringify(Object.entries(nativeFilters).map(([k, v]) => toFilterTriple(k, v))) : undefined,
        limit_page_length: params?.limit || 100,
        limit_start: params?.offset || 0,
        order_by: nativeSortField ? `${nativeSortField} ${params?.sortDir || "desc"}` : undefined,
      },
      client
    );
    return rows.map((row: any) => toCanonicalRow(entityKey, row));
  }

  async get(entityKey: string, credential: UserCredential, id: string): Promise<any> {
    const mapping = ERPNEXT_ENTITY_MAP[entityKey];
    const row = await getDoc(mapping.doctype, id, this.clientFor(credential));
    return toCanonicalRow(entityKey, row);
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

  async runReport(reportKey: string, credential: UserCredential, filters?: Record<string, any>): Promise<any[]> {
    const mapping = ERPNEXT_REPORT_MAP[reportKey];
    if (!mapping) throw new Error(`No ERPNext report mapping for "${reportKey}"`);

    const nativeFilters: Record<string, any> = {};
    for (const [canonical, value] of Object.entries(filters || {})) {
      const native = mapping.filterFieldMap[canonical];
      if (native) nativeFilters[native] = value;
    }

    const client = this.clientFor(credential);
    const res = await client.post("/api/method/frappe.desk.query_report.run", {
      report_name: mapping.reportName,
      filters: nativeFilters,
    });

    return this.normalizeReportResult(res.data.message);
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
 *  instead of everything silently collapsing to an exact match. */
type FilterOp = "=" | "!=" | "like" | "in" | ">" | "<" | ">=" | "<=";

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

function toFilterTriple(field: string, raw: any): [string, FilterOp, any] {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if ("op" in raw) return [field, raw.op as FilterOp, raw.value];
    for (const [alias, op] of Object.entries(MONGO_STYLE_OP_ALIASES)) {
      if (alias in raw) return [field, op, raw[alias]];
    }
  }
  return [field, "=", raw];
}
