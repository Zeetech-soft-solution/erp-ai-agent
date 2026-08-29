import { Router } from "express";
import multer from "multer";
import { requireAuth, AuthedRequest } from "../auth/middleware";
import { ReasoningEngine, resolveEntityKey } from "../core/reasoningEngine";
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
import { businessEmailStore } from "../core/businessEmailStore";
import { listCredentialedUsers } from "../core/credentialedUsersService";
import { systemConnector } from "../config/system.config";
import { scanDocumentImage } from "../providers/vision/documentScanner";
import { conversationStore } from "../core/conversationStore";
import { appConfig } from "../config/app.config";
import { settingsService } from "../core/settingsService";
import { generateReportPdf } from "../core/reportGenerator";

const interactionLogger = new PostgresInteractionLogger();
const engine = new ReasoningEngine(
  new OpenAIProvider(),
  new ContextAssembler([sessionCacheProvider, vectorContextProvider]),
  interactionLogger
);

const router = Router();
router.use(requireAuth);

// A browsable, persistent chat thread never existed before this — see
// db/migrations/013_conversations.sql's own doc comment for why this is a
// separate table from interaction_log. Deliberately keyed by req.session.sub
// (the durable user identity) rather than req.session.sessionId (a single
// login's lifetime, wiped on logout/backend restart) — sessionCacheProvider
// below still uses sessionId for the LLM's own short-term context, that's
// unaffected; this is purely about what the human can browse back to later.
router.post("/prompt", asyncHandler(async (req: AuthedRequest, res) => {
  const { prompt, conversation_id, is_next_step_click } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  // Conversation-history persistence is layered ON TOP of the real chat
  // turn below, never a precondition for it — every store call here is
  // caught on its own so a Postgres hiccup (or the migration simply not
  // having run yet on some deployment) means this one turn just isn't
  // saved to history, not that the user gets no answer at all. Getting
  // this backwards (an unguarded DB write blocking engine.run()) would
  // make the whole chat's reliability depend on a feature that's purely
  // additive by design — worse than not having conversation history at all.
  //
  // ALWAYS persisted, unconditionally — the chat_history_enabled admin
  // setting (db/migrations/014_chat_history_settings.sql) gates ONLY the
  // frontend (whether Chat.tsx renders the sidebar / fetches any of this
  // — see GET /capabilities below, and Chat.tsx's own CHAT_HISTORY_ENABLED
  // handling). Backend-side this keeps building real history the whole
  // time it's "disabled," so the moment an admin flips the setting on,
  // real accumulated history is already there — nobody's demo/testing
  // turns are silently lost just because the sidebar wasn't shown yet.
  let conversationId: string | undefined = typeof conversation_id === "string" ? conversation_id : undefined;
  try {
    // A conversation_id the client sends back must actually belong to this
    // user — never trust it blindly (same reasoning as every ownership
    // check in conversationStore.ts itself). An id that fails this (wrong
    // user, or stale/deleted) silently starts a fresh thread instead of
    // erroring the whole turn over a history-tracking detail.
    if (conversationId && !(await conversationStore.belongsToUser(conversationId, req.session!.sub))) {
      conversationId = undefined;
    }
    if (!conversationId) {
      conversationId = (await conversationStore.create(req.session!.sub, prompt)).id;
    }
    await conversationStore.appendUserMessage(conversationId, prompt, false);
  } catch (err) {
    console.warn("[agent.routes] failed to persist user message to conversation history — continuing without it", err);
    conversationId = undefined;
  }

  // Must happen BEFORE engine.run() reads this session's short-term
  // context — see switchConversation's own doc comment. A no-op for the
  // common case (still the same thread as last turn). Also unconditional
  // — even with the sidebar hidden, a genuinely new thread (conversationId
  // changed) should still reset short-term memory the same way it always
  // will once the frontend is showing threads for real.
  sessionCacheProvider.switchConversation(req.session!.sessionId!, conversationId);

  // See reasoningEngine.ts's own doc comment on isConfirmedAction — a
  // next-step button click sending its own label text back as this same
  // prompt is otherwise indistinguishable from a free-typed message, and
  // the "always confirm before creating" rule was re-applying to an
  // action the button click had already confirmed.
  const response = await engine.run(req.session!, prompt, is_next_step_click === true);
  sessionCacheProvider.addTurn(req.session!.sessionId!, { prompt, summary: response.message.slice(0, 300) });
  recordListFocus(req.session!.sessionId!, response);

  if (conversationId) {
    try {
      await conversationStore.appendAgentMessage(conversationId, response);
    } catch (err) {
      console.warn("[agent.routes] failed to persist agent message to conversation history", err);
    }
  }
  res.json({ ...response, conversation_id: conversationId });
}));

// Last N days of this user's own threads, newest first — the chat UI's
// default sidebar view. `days` defaults to the chat_history_window_days
// admin setting (fallback 3) unless the caller passes its own ?days=.
// Gated the same as /prompt above — while chat_history_enabled is off
// nothing is ever written, so these would return empty anyway; returning
// empty directly avoids even the pointless query.
router.get("/conversations", asyncHandler(async (req: AuthedRequest, res) => {
  if (!(await settingsService.get("chat_history_enabled", appConfig.chatHistoryEnabled))) return res.json({ conversations: [] });
  const days = Number(req.query.days) || (await settingsService.get("chat_history_window_days", 3));
  const conversations = await conversationStore.listRecent(req.session!.sub, days);
  res.json({ conversations });
}));

// Pagination past the default window — `before` is a cursor (an ISO
// timestamp, normally the oldest lastMessageAt already loaded), not a page
// number, so it stays correct even if a thread outside the currently-loaded
// page gets a new message between requests.
router.get("/conversations/older", asyncHandler(async (req: AuthedRequest, res) => {
  if (!(await settingsService.get("chat_history_enabled", appConfig.chatHistoryEnabled))) return res.json({ conversations: [] });
  const before = typeof req.query.before === "string" ? req.query.before : new Date().toISOString();
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const conversations = await conversationStore.listOlder(req.session!.sub, before, limit);
  res.json({ conversations });
}));

router.get("/conversations/:id/messages", asyncHandler(async (req: AuthedRequest, res) => {
  if (!(await settingsService.get("chat_history_enabled", appConfig.chatHistoryEnabled))) return res.json({ messages: [] });
  const messages = await conversationStore.getMessages(req.params.id, req.session!.sub);
  res.json({ messages });
}));

// Fields tried, in order, as a row's human-readable label/amount when
// summarizing a list result into "current_focus" below — covers the
// common canonical shapes (a party/customer/supplier name, a total)
// without needing a per-entity mapping.
const FOCUS_LABEL_FIELDS = ["party", "customer", "supplier", "display_name", "employee", "name"];
const FOCUS_AMOUNT_FIELDS = ["total", "grand_total", "amount", "total_claimed_amount", "outstanding_amount"];

// Confirmed live 2026-08-12: crm.list_opportunities' own "party" field
// holds the ORIGINATING LEAD'S id (a foreign-key reference — e.g.
// "CRM-LEAD-2026-00262"), not a readable name the way "party" reads on
// most other entities (a customer/supplier display name). Included in
// the focus summary as if it were a label, it reads as "id — id" and
// the model latched onto the SECOND id as a more-specific-looking
// identifier, calling crm.get_lead on it instead of crm.get_opportunity
// on the row's real id — a wrong-entity fetch, not a fabrication, but
// just as misleading. A real human-readable label is never itself
// shaped like another record's id, so reject any candidate that
// matches this system's own doc-id pattern (PREFIX-PREFIX-YYYY-NNNNN)
// and fall through to the next field instead. Deliberately simple: any
// value shaped like PREFIX-PREFIX-...-more (2+ hyphen-separated all-
// caps/digit segments, no spaces) — matches every real id in this
// system (CRM-LEAD-2026-00262, SAL-QTN-2026-00014, PUR-ORD-2026-00376,
// ...) while a genuine human-readable label (a company name, "IT -
// SEMPL") never takes this exact shape.
const LOOKS_LIKE_A_RECORD_ID = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+){2,}$/;

/**
 * Confirmed live: a follow-up like "convert any of these quotations"
 * fabricated plausible-looking-but-fake ids (SAL-QTN-2026-00001/00002
 * instead of the real 00006/00047 just listed) even after the system
 * prompt was told to re-fetch rather than guess — it didn't reliably
 * comply. Root cause: sessionCacheProvider.addTurn above only ever
 * caches the short PROSE reply (deliberately terse per the "don't
 * re-list table rows" rule) between turns, never the actual row ids —
 * so a follow-up turn referencing "these" has nothing real to ground
 * on. setFocus() already existed for exactly this ("entities in focus,
 * referenced by id, not dumped as full text") but nothing called it —
 * this is that wire-up: after any small list/report result, remember
 * the real ids (+ one label/amount field each) so the NEXT turn's
 * "Relevant context" contains them instead of a lossy summary the
 * model has to regenerate or guess at. Only the first 10 rows are ever
 * remembered — a "which one did you mean" follow-up only makes sense
 * for a short list anyway, and a 100-row report would blow the context
 * budget for no benefit.
 *
 * Confirmed live 2026-08-12: this USED to bail out entirely (recording
 * nothing) whenever the full result had more than 10 rows — but a
 * plain "list X" with no filter/limit returns up to 100 rows by
 * default (erpnextConnector.ts's `list()`), so almost every ordinary
 * "list purchase orders" then "get the PDF of the first one" follow-up
 * had nothing real to ground on and fabricated a plausible-looking id
 * instead (e.g. "PURCHASE-ORDER-2026-00001" — not even this system's
 * real naming pattern). "The first one"/"that one" almost always means
 * one of the rows actually visible at the top of the table regardless
 * of how many rows exist in total, so remembering the first 10 instead
 * of bailing out covers the common case without growing unbounded.
 *
 * Also confirmed live 2026-08-12: "list open opportunities" (genuinely
 * 0 real rows) left the PRIOR turn's focus (a different entity, Lead)
 * untouched, and a later "the first one in that list" silently reused
 * that stale two-turns-ago focus with no disclaimer — actively wrong,
 * not just unhelpful. A genuinely empty report result now explicitly
 * clears focus instead of leaving it stale.
 */
function recordListFocus(sessionId: string, response: Awaited<ReturnType<typeof engine.run>>) {
  if (response.type !== "report" || !Array.isArray(response.data)) return;
  if (!response.data.length) return sessionCacheProvider.clearFocusKey(sessionId, "recent_list");
  // resolveEntityKey (not a plain split) so a legacy crm.* call (e.g.
  // crm.list_opportunities) resolves to the real entity ("opportunity"),
  // not the meaningless literal "crm" — same bug, same fix, as
  // reasoningEngine.ts's own entityKey derivation; see its doc comment.
  const entityKey = resolveEntityKey(response.meta.tools_used[response.meta.tools_used.length - 1]);
  if (!entityKey) return;
  const rows = response.data
    .slice(0, 10)
    .map((row: Record<string, any>) => {
      const label = FOCUS_LABEL_FIELDS.map((f) => row[f]).find(
        (v) => v != null && !(typeof v === "string" && LOOKS_LIKE_A_RECORD_ID.test(v))
      );
      const amount = FOCUS_AMOUNT_FIELDS.map((f) => row[f]).find((v) => v != null);
      return `${row.id}${label ? ` — ${label}` : ""}${amount != null ? ` (${amount})` : ""}`;
    })
    .join("; ");
  sessionCacheProvider.setFocus(sessionId, "recent_list", `${entityKey}: ${rows}`);
}

// 2MB cap (a phone/webcam photo of a document comfortably fits — this
// is deliberately tight, not the 10MB policyDocuments.routes.ts allows
// for admin PDF/docx uploads, to keep this user-facing endpoint cheap
// to abuse-proof) and image/* only (jpeg/png/webp cover every camera
// and scanner-app export in practice; heic from an un-converted iPhone
// photo is the one common gap — browsers don't render heic either, so
// the frontend's file picker already restricts to image/*).
const scanUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

/**
 * "Scan a bill/PO into a transaction" — deliberately does NOT call any
 * create tool itself. scanDocumentImage() (see providers/vision/
 * documentScanner.ts) only transcribes the image to plain text; that
 * text becomes a normal synthetic user message fed through the exact
 * same engine.run() as a typed prompt, so every existing safety rail
 * (role-gated tools, business rules, confirm-before-create next_steps)
 * applies unchanged — creating a real financial document from OCR'd
 * data is a different risk class than RAG document ingestion, and this
 * route's whole design is to not shortcut around any of the checks a
 * typed "create a purchase order for..." prompt would already go
 * through.
 */
/**
 * Confirmed live 2026-08-12: guessing a scanned document's direction
 * (customer vs supplier) purely from its TYPE/text is real but
 * secondary — the far more reliable signal is WHO is doing the
 * scanning. We generate every outbound document (RFQs, our own Purchase
 * Orders, our own Sales Quotations) inside this system directly; nobody
 * ever needs to photograph one of those. Whatever arrives as a photo is
 * something a real person handed to a real employee, and which kind
 * depends entirely on that employee's own job — a Sales User's day-to-
 * day involves customers handing them POs, never a supplier's
 * quotation; a Purchase User's involves the reverse. Session role is a
 * real, already-authenticated fact (session.erpnext_roles), not a guess
 * the model has to make from OCR text — use it as the PRIMARY signal,
 * with the document-TYPE heuristic in the prompt below as the fallback
 * for roles (Accounts, HR, ...) that plausibly see either direction, or
 * neither.
 */
function scanDirectionHint(roles: string[]): string {
  const has = (r: string) => roles.includes(r);
  const sales = has("Sales User") || has("Sales Manager");
  const purchase = has("Purchase User") || has("Purchase Manager");
  if (sales && !purchase) {
    return `You're logged in as Sales — in this job, a scanned document is virtually always a customer's own ` +
      `Purchase Order confirming they want to buy from us. Default to that reading (verify the named party ` +
      `with customer.list, check quotation.list for them) unless the document's own text clearly says ` +
      `otherwise.`;
  }
  if (purchase && !sales) {
    return `You're logged in as Purchase — in this job, a scanned document is virtually always a supplier's ` +
      `quotation replying to an RFQ we sent them. Default to that reading (verify the named party with ` +
      `supplier.list, check supplier_quotation.list for them) unless the document's own text clearly says ` +
      `otherwise.`;
  }
  if (has("Accounts User") || has("Accounts Manager")) {
    return `You're logged in as Accounts — a scanned document here is normally a bill/invoice, from either a ` +
      `customer or a supplier, for accounting purposes. Check both customer.list and supplier.list for the ` +
      `named party to see which one actually matches, rather than assuming either direction.`;
  }
  if (has("HR User") || has("HR Manager")) {
    return `You're logged in as HR — a scanned document here is normally an employee-facing document (an ` +
      `expense/allowance/conveyance receipt, a certificate, ...), not a sales or purchase transaction. Don't ` +
      `force it into a customer-PO or supplier-quotation reading unless the document's own text is genuinely ` +
      `about one.`;
  }
  return `No specific role hint for this session — rely on the document's own TYPE (a Purchase Order reads as ` +
    `a customer's PO -> Sales Order; a Quotation not our own reads as a supplier's quotation -> Purchase ` +
    `Order) to judge direction.`;
}

router.post("/scan", scanUpload.single("image"), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "image is required (jpeg/png/webp, max 2MB)" });
  const note = typeof req.body.note === "string" ? req.body.note.trim() : "";

  const extracted = await scanDocumentImage(req.file.buffer, req.file.mimetype);
  if (!extracted) return res.status(422).json({ error: "Could not read anything from this image — try a clearer, well-lit photo" });

  // Confirmed live 2026-08-12: scanning a real customer PO addressed
  // "To: <our own company>" — the model looked up OUR OWN company name
  // via crm.list_customers / quotation.list, found nothing (correctly —
  // we're not our own customer), and told the user their real customer
  // didn't exist. Same bug class as the earlier wrong-named-party
  // mismatch, one level up: it's not just "which entity to search", it's
  // "which party named in the document is even the right one to search
  // for". Fix, per explicit product framing: every scanned document was
  // SENT TO US — our own company's name appearing on it (often in a
  // "To"/"Bill To"/"Attention" line) marks US as the recipient, never
  // the customer or supplier to look up. The other named party is who
  // to verify. Deliberately generic here (fetched at request time via
  // getCompanyName(), not hardcoded) so this holds for whatever company
  // any given deployment is actually running as.
  const companyName = await systemConnector.getCompanyName().catch(() => null);
  const ownCompanyHint = companyName
    ? `Our own company is called "${companyName}". Every document you scan was SENT TO US, not by us — if ` +
      `"${companyName}" appears anywhere on it (a "To:", "Bill To:", "Attention:", or similar line), that's just ` +
      `us being addressed, not the customer or supplier. NEVER look up "${companyName}" itself with ` +
      `customer.list/customer.get or supplier.list/supplier.get — always search for the OTHER party named on the ` +
      `document (the one who actually sent it to us).`
    : "";

  // Explicit document-classification guidance, right here rather than
  // only in the general STANDARD DOCUMENT FLOWS system-prompt section —
  // confirmed live 2026-08-12, twice on the same document: (1) correctly
  // identified as a Purchase Order, but then asked the user to retype
  // item codes/warehouse from scratch instead of checking a real linked
  // record first. (2) On the very next scan, checked customer.list for
  // the named party — the wrong entity — got an empty result (correctly
  // empty, it genuinely isn't a customer), and wrongly told the user "no
  // matching supplier record" from that mismatched check, even though
  // it's a real, existing Supplier.
  //
  // Root fix, per explicit product direction: the DOCUMENT TYPE itself
  // is the reliable signal for which direction it's coming from, not a
  // guess at customer-vs-supplier framing — we generate our own outbound
  // Purchase Orders and RFQs INSIDE this system ourselves; we would
  // never scan a photo of our own document. Whatever arrives as a photo
  // came from somewhere else:
  // - Looks like a PURCHASE ORDER -> this is a CUSTOMER's own PO,
  //   confirming they want to buy FROM us. Verify the named party with
  //   customer.list/customer.get (never supplier.list). Check
  //   quotation.list for that customer; if a real Quotation exists, call
  //   quotation.get on its id for the real items. This becomes a Sales
  //   Order.
  // - Looks like a QUOTATION (and isn't our own outgoing Sales
  //   Quotation) -> this is a SUPPLIER's quotation, replying to an RFQ
  //   we sent them. Verify the named party with supplier.list/
  //   supplier.get (never customer.list). Check supplier_quotation.list
  //   for that supplier; if a real Supplier Quotation exists, call
  //   supplier_quotation.get on its id for the real items. This becomes
  //   a Purchase Order.
  // Either way: the scanned text is a lead to verify against real
  // records (the right party AND, where relevant, its quotation), never
  // a substitute for either — never invent items from OCR text alone,
  // and never claim a real party doesn't exist based on checking the
  // wrong entity for it.
  const syntheticPrompt =
    `I'm uploading a photo of a document — help me record it.` +
    (note ? ` My note: "${note}".` : "") +
    ` Here's what I can read from the image:\n\n${extracted}\n\n` +
    (ownCompanyHint ? `${ownCompanyHint}\n\n` : "") +
    `${scanDirectionHint(req.session!.erpnext_roles || [])} ` +
    `Tell me what kind of document this looks like and what you'd record it as. As a fallback signal (most ` +
    `likely, not absolute — the role hint above and the document's own real content both matter), the ` +
    `document TYPE also points at a direction: a Purchase Order usually reads as a CUSTOMER's own PO ` +
    `confirming they want to buy from us — verify the named party with customer.list, check quotation.list ` +
    `for them, and this becomes a Sales Order. A Quotation (that isn't our own outgoing Sales Quotation) ` +
    `usually reads as a SUPPLIER's quotation replying to our RFQ — verify the named party with ` +
    `supplier.list, check supplier_quotation.list for them, and this becomes a Purchase Order. Either way, ` +
    `pull real line items from the matching record via its own .get call rather than inventing them from ` +
    `the scanned text. If it's neither of these — a bill, an expense receipt, or anything else — just ` +
    `describe what you actually see and ask what to do with it, don't force it into one of these two flows. ` +
    `Ask me anything that's unclear or missing before creating anything, and always confirm with me before ` +
    `you actually create a record.`;

  // Same conversation-history dance as /prompt above, ALWAYS persisted
  // unconditionally the same way — a scanned image is just as real a turn
  // as a typed one (skipping it entirely was a real gap the feature had).
  // The chat_history_enabled admin setting still gates ONLY the frontend
  // sidebar (see GET /capabilities), never this write. The user-visible
  // label saved is "[scanned image]" (+ note), not the raw OCR'd document
  // text — same discipline as the addTurn call below, and the full
  // response (rendered from turnsFromMessages on replay) still carries
  // the real answer either way.
  const { conversation_id } = req.body;
  let conversationId: string | undefined = typeof conversation_id === "string" ? conversation_id : undefined;
  const historyLabel = note ? `[scanned image] ${note}` : "[scanned image]";
  try {
    if (conversationId && !(await conversationStore.belongsToUser(conversationId, req.session!.sub))) {
      conversationId = undefined;
    }
    if (!conversationId) {
      conversationId = (await conversationStore.create(req.session!.sub, historyLabel)).id;
    }
    await conversationStore.appendUserMessage(conversationId, historyLabel, false);
  } catch (err) {
    console.warn("[agent.routes] failed to persist scanned-image message to conversation history — continuing without it", err);
    conversationId = undefined;
  }
  sessionCacheProvider.switchConversation(req.session!.sessionId!, conversationId);

  const response = await engine.run(req.session!, syntheticPrompt);
  sessionCacheProvider.addTurn(req.session!.sessionId!, { prompt: "[scanned image]", summary: response.message.slice(0, 300) });

  if (conversationId) {
    try {
      await conversationStore.appendAgentMessage(conversationId, response);
    } catch (err) {
      console.warn("[agent.routes] failed to persist scanned-image agent message to conversation history", err);
    }
  }
  res.json({ ...response, conversation_id: conversationId });
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

// Real simulated inbox data (see erpdatabuild's simulate_email_activity.py
// and core/businessEmailStore.ts) - kind=email backs the Email tab's Inbox
// view, kind=ticket backs the Support tab, both scoped to the logged-in
// user's own real credentialed inbox (assigned_user_email = req.session.sub).
router.get("/inbox", asyncHandler(async (req: AuthedRequest, res) => {
  const kind = req.query.kind === "ticket" ? "ticket" : "email";
  const items = await businessEmailStore.list(req.session!.sub, kind);
  res.json({ items });
}));

// The full list of real credentialed demo logins, regardless of the
// calling tester's own ERPNext role - powers the Email tab's Compose "To"
// picker and the "Email Send (test)" tab's "To" picker (see
// core/credentialedUsersService.ts for why this can't just be
// employee.list).
router.get("/credentialed-users", asyncHandler(async (req: AuthedRequest, res) => {
  const users = await listCredentialedUsers();
  res.json({ users });
}));

// "Email Send (test)" - a tester impersonates a real Customer (the "from")
// sending to a real credentialed employee (the "to"). Deliberately NOT the
// email.send tool (that always sends OUTBOUND as whoever is actually
// logged in) - this inserts a synthetic INBOUND thread straight into the
// recipient's real inbox, same shape as erpdatabuild's own simulated
// threads, so it shows up for them exactly like a real incoming email
// would (see businessEmailStore.insertTestSend).
router.post("/test-send", asyncHandler(async (req: AuthedRequest, res) => {
  const { toEmail, fromEmail, fromName, subject, body } = req.body || {};
  if (!toEmail || !fromEmail || !subject || !body) {
    return res.status(400).json({ error: "toEmail, fromEmail, subject, and body are required" });
  }
  const thread = await businessEmailStore.insertTestSend({ toEmail, fromEmail, fromName: fromName || fromEmail, subject, body });
  res.json({ ok: true, thread });
}));

// What tickets.resolve / project.comment have actually recorded for this
// user - e.g. ?module=project reads back real comments so Projects can
// show them next to (or instead of) the sample data's canned ones.
router.get("/workflow-actions", asyncHandler(async (req: AuthedRequest, res) => {
  const module = typeof req.query.module === "string" ? req.query.module : undefined;
  const actions = await workflowActionStore.list(req.session!.sub, module);
  res.json({ actions });
}));

// The URL document.get_pdf hands back (see modules/documents/index.ts)
// resolves here — a plain <a href> can't carry our Authorization
// header, so the frontend fetches this with the header attached and
// turns the response into a downloadable Blob itself, same auth
// discipline as every other route, just no bearer-token-in-URL.
router.get("/document-pdf", asyncHandler(async (req: AuthedRequest, res) => {
  const entityKey = typeof req.query.entityKey === "string" ? req.query.entityKey : undefined;
  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  if (!entityKey || !id) return res.status(400).json({ error: "entityKey and id are required" });
  const { filename, contentType, buffer } = await systemConnector.getDocumentPdf(entityKey, req.session!.credential, id);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}));

// The URL report.generate hands back (see modules/reports/index.ts)
// resolves here — same lazy-generation discipline as /document-pdf
// above: report.generate's own tool handler never fetches a row, this
// is the ONLY place the actual report data gets pulled and rendered,
// on demand, streamed straight to the response. Not re-checked against
// roles.policy.ts's "report.generate" grant here — same reasoning as
// /document-pdf: that grant only decides whether the tool is visible
// to a role's chat, not a second data boundary. The underlying fetch
// (systemConnector.list/runReport) always runs AS this session's real
// credential, so ERPNext's own permissions on the doctype are what
// actually bound what comes back, exactly as if the person had opened
// that report/list in ERPNext's own desk UI directly.
router.get("/report-pdf", asyncHandler(async (req: AuthedRequest, res) => {
  const source = typeof req.query.source === "string" ? req.query.source : undefined;
  const reportKey = typeof req.query.reportKey === "string" ? req.query.reportKey : undefined;
  const entityKey = typeof req.query.entityKey === "string" ? req.query.entityKey : undefined;
  let filters: Record<string, any> | undefined;
  if (typeof req.query.filters === "string") {
    try {
      filters = JSON.parse(req.query.filters);
    } catch {
      return res.status(400).json({ error: "filters must be valid JSON" });
    }
  }
  // Real, explicit column-selection ask (2026-08-20) — see
  // reportGenerator.ts's own narrowColumns() doc comment. Same
  // "malformed JSON is a real 400, not a silent ignore" discipline as
  // filters just above.
  let columns: string[] | undefined;
  if (typeof req.query.columns === "string") {
    try {
      const parsed = JSON.parse(req.query.columns);
      if (Array.isArray(parsed)) columns = parsed.filter((c) => typeof c === "string");
    } catch {
      return res.status(400).json({ error: "columns must be valid JSON" });
    }
  }
  if (source !== "named_report" && source !== "entity_query") {
    return res.status(400).json({ error: 'source must be "named_report" or "entity_query"' });
  }
  if (source === "named_report" && !reportKey) return res.status(400).json({ error: "reportKey is required" });
  if (source === "entity_query" && !entityKey) return res.status(400).json({ error: "entityKey is required" });

  const args = source === "named_report" ? { source, reportKey: reportKey!, filters, columns } : { source, entityKey: entityKey!, filters, columns };
  const { filename, buffer } = await generateReportPdf(args as any, req.session!.credential);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}));

router.get("/capabilities", asyncHandler(async (req: AuthedRequest, res) => {
  const tools = listAllowedTools(req.session!);
  // Best-effort — getCompanyName() already swallows its own failures and
  // returns null, so this can't be the reason the whole panel fails to load.
  const companyName = await systemConnector.getCompanyName().catch(() => null);
  // The ONLY thing the chat_history_enabled admin setting actually gates —
  // see agent.routes.ts's own /prompt doc comment: the backend always
  // persists real conversation history regardless of this value (it's the
  // company's own record of the agent's use, not a privacy toggle). This
  // is purely "should the chat UI show the sidebar and let a user browse
  // back to it" — Chat.tsx reads these two fields to decide.
  const chatHistoryEnabled = await settingsService.get("chat_history_enabled", appConfig.chatHistoryEnabled);
  const chatHistoryWindowDays = await settingsService.get("chat_history_window_days", 3);
  res.json({
    role_context: req.session!.erpnext_roles,
    company_name: companyName,
    chat_history_enabled: chatHistoryEnabled,
    chat_history_window_days: chatHistoryWindowDays,
    tools: tools.map((t) => ({ name: t.name, description: t.description })),
  });
}));

export default router;
