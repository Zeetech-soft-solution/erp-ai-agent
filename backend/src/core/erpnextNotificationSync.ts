import { Session } from "./types";

/**
 * STUB — background notification sync. Free tier: no-op. The real
 * ERPNext-native notification source and polling mechanism is a
 * pro-tier capability.
 */
export function startErpnextNotificationPoll(_intervalMs: number) {
  // not implemented in this tier
}

export function syncNowForSession(_session: Session): void {
  // not implemented in this tier
}
