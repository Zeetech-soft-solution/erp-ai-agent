import axios, { AxiosInstance } from "axios";
import { appConfig } from "../config/app.config";

/**
 * Low-level ERPNext REST helpers. The SERVICE-level client (default
 * export) is reserved for system introspection only (getUserRoles) —
 * every business-data helper below now accepts an optional `client`
 * override, and erpnextConnector.ts always passes one built for the
 * ACTING PERSON (session cookie or personal API key), never this
 * default service client, so ERPNext's own audit trail attributes
 * every create/update to the real user.
 */
const erpnextClient: AxiosInstance = axios.create({
  baseURL: appConfig.erpnext.baseUrl,
  headers: {
    Authorization: `token ${appConfig.erpnext.apiKey}:${appConfig.erpnext.apiSecret}`,
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

export default erpnextClient;

/**
 * ERPNext error bodies carry the actually useful explanation in
 * `_error_message` or the double-JSON-encoded `_server_messages` array,
 * not in the HTTP status text axios surfaces by default ("Request
 * failed with status code 403"). Unwrapping here — the one file that
 * knows ERPNext's REST shape — means every caller (list/get/create/
 * update) gets a real, debuggable message for free.
 */
function extractErpNextMessage(err: any): string {
  const data = err.response?.data;
  if (data?._server_messages) {
    try {
      const parsed: string[] = JSON.parse(data._server_messages);
      const messages = parsed.map((m) => {
        try {
          return JSON.parse(m).message;
        } catch {
          return m;
        }
      });
      if (messages.length) return messages.join("; ");
    } catch {
      // fall through to other fields below
    }
  }
  return data?._error_message || data?.message || data?.exception || err.message;
}

async function unwrap<T>(request: Promise<{ data: { data: T } }>): Promise<T> {
  try {
    const res = await request;
    return res.data.data;
  } catch (err: any) {
    const wrapped = new Error(extractErpNextMessage(err));
    (wrapped as any).status = err.response?.status;
    throw wrapped;
  }
}

// Whitelisted RPC methods (/api/method/<dotted.path>) wrap their return
// value in "message", not "data" — a genuinely different envelope from
// every /api/resource/<doctype> call above, so this gets its own unwrap
// rather than overloading the one above. Used for frappe.client.get_count
// (erpnextConnector.ts's count()) and any future whitelisted method call
// that isn't a plain doctype list/get/create/update.
async function unwrapMethod<T>(request: Promise<{ data: { message: T } }>): Promise<T> {
  try {
    const res = await request;
    return res.data.message;
  } catch (err: any) {
    const wrapped = new Error(extractErpNextMessage(err));
    (wrapped as any).status = err.response?.status;
    throw wrapped;
  }
}

export async function callMethod<T = any>(method: string, params?: Record<string, any>, client: AxiosInstance = erpnextClient): Promise<T> {
  return unwrapMethod<T>(client.get(`/api/method/${method}`, { params }));
}

export async function getDocList(doctype: string, params?: Record<string, any>, client: AxiosInstance = erpnextClient) {
  return unwrap<any[]>(client.get(`/api/resource/${doctype}`, { params }));
}

export async function getDoc(doctype: string, name: string, client: AxiosInstance = erpnextClient) {
  return unwrap<any>(client.get(`/api/resource/${doctype}/${encodeURIComponent(name)}`));
}

export async function createDoc(doctype: string, payload: Record<string, any>, client: AxiosInstance = erpnextClient) {
  return unwrap<any>(client.post(`/api/resource/${doctype}`, payload));
}

export async function updateDoc(doctype: string, name: string, payload: Record<string, any>, client: AxiosInstance = erpnextClient) {
  return unwrap<any>(client.put(`/api/resource/${doctype}/${encodeURIComponent(name)}`, payload));
}
