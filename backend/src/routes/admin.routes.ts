import { Router } from "express";
import { requireAuth, AuthedRequest } from "../auth/middleware";
import { requireAdmin } from "../auth/adminMiddleware";
import { settingsService } from "../core/settingsService";
import { userSettingsService } from "../core/userSettingsService";
import { moduleRegistry } from "../core/moduleRegistry";
import { userCredentialStore } from "../core/userCredentialStore";
import { systemConnector } from "../config/system.config";
import { sessionStore } from "../core/sessionStore";
import { asyncHandler } from "../core/asyncHandler";
import { DEMO_ADMIN_EMAIL } from "../auth/erpnextAuth";

const router = Router();
router.use(requireAuth, requireAdmin);

/**
 * The ONE place that decides "is this the demo.admin@local session".
 * Every write route in this file calls blockIfDemo() first — the demo
 * login can look at real, populated Global/per-user settings and the
 * credentials table, but can never persist a change, and never sees an
 * actual secret value (see redactSecrets/maskApiKey below), even one a
 * real admin already saved. Real sessions (anyone who signed in through
 * the actual connected-system login) are completely unaffected by any
 * of this — same read/write/visibility as before this file changed.
 */
function isDemo(req: AuthedRequest): boolean {
  return req.session?.sub === DEMO_ADMIN_EMAIL;
}

function blockIfDemo(req: AuthedRequest, res: import("express").Response): boolean {
  if (isDemo(req)) {
    res.status(403).json({ error: "Demo login — viewing only, saving is disabled." });
    return true;
  }
  return false;
}

router.get(
  "/settings",
  asyncHandler(async (req: AuthedRequest, res) => {
    const settings = await settingsService.list();
    if (!isDemo(req)) return res.json({ settings });
    // Demo session: same rows, but every password-type value comes back
    // blank rather than whatever a real admin actually saved.
    res.json({ settings: settings.map((s) => (s.value_type === "password" ? { ...s, value: "" } : s)) });
  })
);

router.put("/settings/:key", async (req: AuthedRequest, res) => {
  if (blockIfDemo(req, res)) return;
  try {
    const updated = await settingsService.update(req.params.key, req.body.value, req.session!.sub);
    res.json({ setting: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Per-user settings (email/support/project-plan/policy) — see
// core/userSettingsService.ts. Real reads/writes for a real admin;
// blocked/redacted for the demo session, same rules as Global Settings.
router.get("/user-settings/defs", asyncHandler(async (_req, res) => {
  res.json({ defs: await userSettingsService.listDefs() });
}));

router.get(
  "/user-settings/:email",
  asyncHandler(async (req: AuthedRequest, res) => {
    const values = await userSettingsService.listForUser(req.params.email);
    if (!isDemo(req)) return res.json({ values });
    const defs = await userSettingsService.listDefs();
    const passwordKeys = new Set(defs.filter((d) => d.value_type === "password").map((d) => d.key));
    res.json({ values: values.map((v) => (passwordKeys.has(v.key) ? { ...v, value: "" } : v)) });
  })
);

router.put("/user-settings/:email/:key", async (req: AuthedRequest, res) => {
  if (blockIfDemo(req, res)) return;
  try {
    const updated = await userSettingsService.update(req.params.email, req.params.key, req.body.value, req.session!.sub);
    res.json({ setting: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// System status strip — real signal (which modules loaded, how many
// tools each exposes), not decorative, for the admin dashboard header.
router.get("/status", (_req, res) => {
  const modules = moduleRegistry.getModules().map((m) => ({ name: m.name, tool_count: m.tools.length }));
  res.json({ modules });
});

/**
 * Provisioning: admin generates an API key/secret for a user in
 * ERPNext (User -> API Access -> Generate Keys, on that user's
 * profile) and hands it to the agent here. Validated against ERPNext
 * BEFORE storing — refuses a key that doesn't actually belong to the
 * stated email, so a typo can't silently attach the wrong identity.
 * The secret is encrypted at rest (core/credentialVault.ts) and never
 * returned in any response after this point — list only ever shows
 * metadata (who provisioned it, when), never the secret itself. The
 * demo session additionally never sees even the (normally-visible-to-
 * real-admins) API KEY itself, masked below out of extra caution.
 */
router.get(
  "/users",
  asyncHandler(async (req: AuthedRequest, res) => {
    const users = await userCredentialStore.list();
    if (!isDemo(req)) return res.json({ users });
    res.json({ users: users.map((u) => ({ ...u, apiKey: "•".repeat(12) })) });
  })
);

router.put("/users/:email/credential", async (req: AuthedRequest, res) => {
  if (blockIfDemo(req, res)) return;
  const { email } = req.params;
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret) return res.status(400).json({ error: "apiKey and apiSecret are required" });

  try {
    await systemConnector.loginWithApiKey(email, apiKey, apiSecret); // throws if key doesn't belong to email
    await userCredentialStore.set(email, apiKey, apiSecret, req.session!.sub);
    sessionStore.destroyAllForUser(email); // any active session picks up the new credential on next login
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Could not validate this key against the connected system" });
  }
});

router.delete("/users/:email/credential", async (req: AuthedRequest, res) => {
  if (blockIfDemo(req, res)) return;
  await userCredentialStore.revoke(req.params.email);
  sessionStore.destroyAllForUser(req.params.email);
  res.json({ ok: true });
});

export default router;
