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

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/settings", asyncHandler(async (_req, res) => {
  res.json({ settings: await settingsService.list() });
}));

router.put("/settings/:key", async (req: AuthedRequest, res) => {
  try {
    const updated = await settingsService.update(req.params.key, req.body.value, req.session!.sub);
    res.json({ setting: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Per-user settings (email/support/project-plan/policy) — read-only
// from here; see core/userSettingsService.ts. No write route yet on
// purpose, the admin UI's save button never calls one.
router.get("/user-settings/defs", asyncHandler(async (_req, res) => {
  res.json({ defs: await userSettingsService.listDefs() });
}));

router.get("/user-settings/:email", asyncHandler(async (req, res) => {
  res.json({ values: await userSettingsService.listForUser(req.params.email) });
}));

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
 * metadata (who provisioned it, when), never the secret itself.
 */
router.get("/users", asyncHandler(async (_req, res) => {
  res.json({ users: await userCredentialStore.list() });
}));

router.put("/users/:email/credential", async (req: AuthedRequest, res) => {
  const { email } = req.params;
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret) return res.status(400).json({ error: "apiKey and apiSecret are required" });

  try {
    await systemConnector.loginWithApiKey(email, apiKey, apiSecret); // throws if key doesn't belong to email
    await userCredentialStore.set(email, apiKey, apiSecret, req.session!.sub);
    sessionStore.destroyAllForUser(email); // any active session picks up the new credential on next login
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Could not validate this key against ERPNext" });
  }
});

router.delete("/users/:email/credential", asyncHandler(async (req: AuthedRequest, res) => {
  await userCredentialStore.revoke(req.params.email);
  sessionStore.destroyAllForUser(req.params.email);
  res.json({ ok: true });
}));

export default router;
