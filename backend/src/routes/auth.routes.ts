import { Router } from "express";
import { loginWithPassword, loginWithApiKey, DEMO_ADMIN_EMAIL } from "../auth/erpnextAuth";
import { requireAuth, AuthedRequest } from "../auth/middleware";
import { sessionStore } from "../core/sessionStore";
import { syncNowForSession } from "../core/erpnextNotificationSync";

const router = Router();

/**
 * Accepts either { email, password } OR { email, apiKey, apiSecret }.
 * Both end in the same place — a Session carrying a UserCredential
 * that impersonates this specific person on every subsequent call.
 */
router.post("/login", async (req, res) => {
  const { email, password, apiKey, apiSecret } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });

  try {
    const result = password
      ? await loginWithPassword(email, password)
      : apiKey && apiSecret
      ? await loginWithApiKey(email, apiKey, apiSecret)
      : null;

    if (!result) return res.status(400).json({ error: "Provide either password, or apiKey + apiSecret" });

    // Fire-and-forget: a freshly-signed-in user shouldn't wait for the
    // background poll's next tick to see assignments that already
    // existed before they logged in.
    syncNowForSession(result.session);

    res.json({ token: result.token, roles: result.session.erpnext_roles, allowed_tools: result.session.allowed_tools });
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Login failed" });
  }
});

router.post("/logout", requireAuth, (req: AuthedRequest, res) => {
  sessionStore.destroy(req.sessionId!);
  res.json({ ok: true });
});

/**
 * Lets the frontend tell a real, authenticated session apart from the
 * demo.admin@local shortcut WITHOUT decoding the JWT itself — `isDemo`
 * is the one flag every admin page checks before deciding whether Save
 * actually persists or shows the "not authorized" message, and whether
 * secret-type values are redacted in what it displays.
 */
router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({
    email: req.session!.sub,
    roles: req.session!.erpnext_roles,
    isDemo: req.session!.sub === DEMO_ADMIN_EMAIL,
  });
});

export default router;
