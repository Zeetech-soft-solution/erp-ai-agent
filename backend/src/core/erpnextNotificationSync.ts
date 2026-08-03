import { randomUUID } from "crypto";
import { systemConnector } from "../config/system.config";
import { sessionStore } from "./sessionStore";
import { alertStore } from "./alertStore";
import { Session } from "./types";

/**
 * THE real notification source, found by testing how ERPNext itself
 * does it rather than inventing a custom mechanism: ToDo (Frappe's
 * generic assignment doctype - see erpnext/entityMaps/notifications.ts).
 * Whenever someone assigns a record to a user via ERPNext's standard
 * "Assign To" - the same action ERPNext's own UI uses everywhere - it
 * shows up here. Reached through the exact same systemConnector.list()
 * every other tool call already uses, so a SAP (or other) connector
 * only needs its own "todo" entity mapping to plug in the same way;
 * nothing ERPNext-specific lives outside entityMaps/notifications.ts.
 *
 * Two other paths were tried and rejected: ERPNext's Notification Log
 * doctype looks purpose-built but isn't populated by ordinary business
 * events on this instance (confirmed empty even after a real
 * assignment), and writing to it directly requires ignore_permissions,
 * which only works from server-side Python inside ERPNext itself - not
 * reachable over REST at all, from any user. frappe.desk.notifications.
 * get_notifications() gives per-doctype OPEN counts (e.g. "406 Sales
 * Orders"), which is a business-rule total, not a "what's new" feed.
 * ToDo is the one that's genuinely itemized, timestamped, and
 * REST-accessible as the actual user.
 *
 * Runs only for users with an active session right now (see
 * sessionStore.getActiveSessions()), never the full user directory.
 */
const seen = new Map<string, Set<string>>(); // userEmail -> ToDo ids already turned into an alert

async function syncOne(session: Session): Promise<void> {
  const rows = await systemConnector.list("todo", session.credential, {
    filters: { owner: session.sub, status: "Open" },
    limit: 20,
  });

  let seenForUser = seen.get(session.sub);
  if (!seenForUser) {
    seenForUser = new Set();
    seen.set(session.sub, seenForUser);
  }

  for (const row of rows) {
    if (seenForUser.has(row.id)) continue;
    seenForUser.add(row.id);
    await alertStore.push(session.sub, {
      id: randomUUID(),
      entityKey: (row.reference_type || "record").toLowerCase().replace(/\s+/g, "_"),
      recordId: row.reference_name,
      message: `You were assigned ${row.reference_type || "a record"} ${row.reference_name}${row.description ? `: ${row.description}` : ""}`,
      createdAt: new Date().toISOString(),
    });
  }
}

/** Started once at boot - see server.ts. */
export function startErpnextNotificationPoll(intervalMs: number) {
  setInterval(() => {
    for (const session of sessionStore.getActiveSessions()) {
      syncOne(session).catch(() => {
        // one user's ERPNext call failing (expired session, transient
        // network) shouldn't block anyone else's poll cycle
      });
    }
  }, intervalMs);
}

/** Called right after login so a freshly-signed-in user sees whatever
 *  was already assigned to them immediately, not up to intervalMs later. */
export function syncNowForSession(session: Session): void {
  syncOne(session).catch(() => {});
}
