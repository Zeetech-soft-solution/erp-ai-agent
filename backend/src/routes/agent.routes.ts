import { Router } from "express";
import { requireAuth, AuthedRequest } from "../auth/middleware";
import { ReasoningEngine } from "../core/reasoningEngine";
import { ContextAssembler } from "../core/contextAssembler";
import { sessionCacheProvider } from "../providers/context/sessionCacheProvider";
import { vectorContextProvider } from "../providers/context/vectorContextProvider";
import { OpenAIProvider } from "../providers/llm/openaiProvider";
import { PostgresInteractionLogger } from "../core/interactionLogger";
import { listAllowedTools } from "../core/gateway";
import { asyncHandler } from "../core/asyncHandler";
import { alertStore } from "../core/alertStore";
import { mailboxConnector } from "../providers/mail/stubMailboxConnector";
import { workflowActionStore } from "../core/workflowActionStore";

const interactionLogger = new PostgresInteractionLogger();
const engine = new ReasoningEngine(
  new OpenAIProvider(),
  new ContextAssembler([sessionCacheProvider, vectorContextProvider]),
  interactionLogger
);

const router = Router();
router.use(requireAuth);

router.post("/prompt", asyncHandler(async (req: AuthedRequest, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });
  const response = await engine.run(req.session!, prompt);
  sessionCacheProvider.addTurn(req.session!.sub, { prompt, summary: response.message.slice(0, 300) });
  res.json(response);
}));

router.post("/feedback/:interactionId", asyncHandler(async (req: AuthedRequest, res) => {
  const { feedback } = req.body;
  if (feedback !== 1 && feedback !== -1 && feedback !== null) {
    return res.status(400).json({ error: "feedback must be 1, -1, or null" });
  }
  const ok = await interactionLogger.setFeedback(req.params.interactionId, req.session!.sub, feedback);
  if (!ok) return res.status(404).json({ error: "Interaction not found" });
  res.json({ ok: true });
}));

// `since` (an ISO timestamp) turns this from "recent history" into "only
// what's arrived after this point" - the same endpoint serves both the
// Notifications tab's initial load and its 15s poll. Nothing is consumed
// by reading it (see alertStore.ts) - safe to call from more than one
// place without racing.
router.get("/notifications", asyncHandler(async (req: AuthedRequest, res) => {
  const since = typeof req.query.since === "string" ? req.query.since : undefined;
  const notifications = await alertStore.list(req.session!.sub, since);
  res.json({ notifications });
}));

router.post("/notifications/:id/read", asyncHandler(async (req: AuthedRequest, res) => {
  await alertStore.markRead(req.session!.sub, req.params.id);
  res.json({ ok: true });
}));

// What the email.send tool has actually recorded for this user - the
// Email tab's Sent view reads this so a confirmed reply's outcome shows
// up there, not just as a message inside the chat transcript.
router.get("/sent-emails", asyncHandler(async (req: AuthedRequest, res) => {
  const emails = await mailboxConnector.listSent(req.session!.sub);
  res.json({ emails });
}));

// What tickets.resolve / project.comment have actually recorded for this
// user - e.g. ?module=project reads back real comments so Projects can
// show them next to (or instead of) the sample data's canned ones.
router.get("/workflow-actions", asyncHandler(async (req: AuthedRequest, res) => {
  const module = typeof req.query.module === "string" ? req.query.module : undefined;
  const actions = await workflowActionStore.list(req.session!.sub, module);
  res.json({ actions });
}));

router.get("/capabilities", (req: AuthedRequest, res) => {
  const tools = listAllowedTools(req.session!);
  res.json({ role_context: req.session!.erpnext_roles, tools: tools.map((t) => ({ name: t.name, description: t.description })) });
});

export default router;
