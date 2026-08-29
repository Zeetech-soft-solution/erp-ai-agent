import { systemConnector } from "../config/system.config";
import { rolePolicy } from "../config/rolePolicy.config";
import { issueAgentToken } from "./jwt";
import { sessionStore } from "../core/sessionStore";
import { userCredentialStore } from "../core/userCredentialStore";
import { Session, UserCredential } from "../core/types";

// Demo-only shortcut, explicitly requested: this exact email/password
// never touches ERPNext and never goes through a real role check — it
// just signs straight into a synthetic System Manager session so
// someone can look around the admin console without a real ERPNext
// account. requireAdmin (auth/adminMiddleware.ts) still runs for this
// session like any other; it just always passes because the session
// carries "System Manager" already. Every other email/password still
// goes through the real systemConnector + getUserRoles path below,
// unchanged.
export const DEMO_ADMIN_EMAIL = "demo.admin@local";
const DEMO_ADMIN_PASSWORD = "123";

async function finishLogin(identifier: string, credential: UserCredential) {
  const roles = await systemConnector.getUserRoles(identifier);
  const allowedTools = await rolePolicy.resolveAllowedTools(roles);
  // Stamped once, here, at the single place roles and credential are
  // both already in scope — every downstream read call (list/get/
  // aggregate/runReport/PDF, across every module) just keeps passing
  // session.credential exactly as before and picks this up for free via
  // erpnextConnector.ts's clientFor(). Never touched for writes — see
  // that file's comment on why. "String" because UserCredential's own
  // fields are all string-typed (core/types.ts).
  const fullAccessCredential: UserCredential = {
    ...credential,
    fullAccess: String(systemConnector.isFullAccessRole(roles)),
  };
  const session: Session = { sub: identifier, erpnext_roles: roles, allowed_tools: allowedTools, credential: fullAccessCredential };

  const sessionId = sessionStore.create(session);
  const token = issueAgentToken(sessionId);
  return { token, session };
}

/**
 * Password login proves identity (this person really knows their own
 * ERPNext password) — but the credential actually used to IMPERSONATE
 * them for every subsequent call prefers an admin-provisioned, stored
 * API key if one exists (see core/userCredentialStore.ts). Falls back
 * to the session cookie from this login if no stored key has been set
 * up yet, so the system works before any admin provisioning happens.
 */
export async function loginWithPassword(email: string, password: string) {
  if (email.toLowerCase() === DEMO_ADMIN_EMAIL && password === DEMO_ADMIN_PASSWORD) {
    const session: Session = {
      sub: DEMO_ADMIN_EMAIL,
      erpnext_roles: ["System Manager"], // not verified anywhere — demo-only, see comment above
      allowed_tools: ["*"],
      credential: { mode: "none" }, // no real ERPNext identity behind this session
    };
    const sessionId = sessionStore.create(session);
    const token = issueAgentToken(sessionId);
    return { token, session };
  }

  const sessionCredential = await systemConnector.loginWithPassword(email, password);

  const stored = await userCredentialStore.get(email);
  const credential: UserCredential = stored
    ? { mode: "api_key", apiKey: stored.apiKey, apiSecret: stored.apiSecret }
    : sessionCredential;

  return finishLogin(email, credential);
}

/** Direct API key login — unchanged: user's own key/secret, validated
 *  against ERPNext, used for this session only (not automatically
 *  persisted — an admin has to explicitly provision it via the admin
 *  API for it to become the standing credential on future password logins). */
export async function loginWithApiKey(email: string, apiKey: string, apiSecret: string) {
  const credential = await systemConnector.loginWithApiKey(email, apiKey, apiSecret);
  return finishLogin(email, credential);
}
