import { getDocList } from "../erpnext/client";

export interface CredentialedUser {
  email: string;
  name: string;
  department?: string;
  designation?: string;
}

/**
 * The full list of real demo logins (Employee.user_id, set by
 * erpdatabuild's build/1_build_masters.py — see that repo's
 * user_credentials.md), for UI surfaces that need to offer "any real
 * employee" regardless of the calling tester's own ERPNext role — the
 * Email tab's Compose "To" picker and the "Email Send (test)" tab's "To"
 * picker (see routes/agent.routes.ts).
 *
 * Deliberately NOT going through the per-user entity/tool system
 * (employee.list): that's role-gated to the calling session's own ERPNext
 * permissions, and (per config/modules/hr/entities.ts's own comment) never
 * returns email on .list anyway, only on a per-record .get — an N+1 this
 * avoids entirely. Uses the same privileged service-account client
 * erpnextConnector.ts's getUserRoles()/getCompanyName() already use for
 * system introspection (getDocList's default client), not any one user's
 * personal credential.
 */
let cache: { value: CredentialedUser[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function listCredentialedUsers(): Promise<CredentialedUser[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.value;

  const rows = await getDocList("Employee", {
    filters: JSON.stringify([["user_id", "!=", ""]]),
    fields: JSON.stringify(["employee_name", "department", "designation", "user_id"]),
    limit_page_length: 0,
  });

  const value = (rows as any[])
    .filter((r) => r.user_id)
    .map((r) => ({
      email: r.user_id as string,
      name: (r.employee_name as string) || r.user_id,
      department: r.department || undefined,
      designation: r.designation || undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  cache = { value, fetchedAt: Date.now() };
  return value;
}
