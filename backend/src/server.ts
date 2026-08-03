import "dotenv/config";
import express from "express";
import cors from "cors";
import { bootstrapModules } from "./bootstrap";
import { appConfig } from "./config/app.config";
import authRoutes from "./routes/auth.routes";
import toolsRoutes from "./routes/tools.routes";
import agentRoutes from "./routes/agent.routes";
import adminRoutes from "./routes/admin.routes";
import policyDocumentsRoutes from "./routes/policyDocuments.routes";
import webhooksRoutes from "./routes/webhooks.routes";
import { startErpnextNotificationPoll } from "./core/erpnextNotificationSync";

bootstrapModules();
startErpnextNotificationPoll(10000);

const app = express();
app.use(cors());
// The `verify` callback stashes the raw body buffer onto the request —
// needed only by routes/webhooks.routes.ts to check ERPNext's HMAC
// signature (which is computed over the exact bytes sent, not the
// re-serialized parsed object). Every other route is unaffected.
app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

app.use("/api/auth", authRoutes);
app.use("/api/tools", toolsRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/policy-documents", policyDocumentsRoutes);
app.use("/api/webhooks", webhooksRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Last-resort net for anything asyncHandler-wrapped routes forward via
// next(err) — a broken LLM/ERPNext call or DB error should fail that one
// request, never bring the whole server down for every other user.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled request error]", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

app.listen(appConfig.port, () => console.log(`ERP Agent backend running on :${appConfig.port}`));
