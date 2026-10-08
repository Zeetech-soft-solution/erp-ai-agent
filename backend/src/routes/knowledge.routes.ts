import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { requireAdmin } from "../auth/adminMiddleware";
import { asyncHandler } from "../core/asyncHandler";
import { KnowledgeStore } from "../core/knowledgeStore";
import { embedder } from "../embedder";

const store = new KnowledgeStore(embedder);
const router = Router();
router.use(requireAuth, requireAdmin);

/** Indexed knowledge documents (admin view). */
router.get("/", asyncHandler(async (_req, res) => {
  res.json({ documents: await store.list() });
}));

/** Re-reads backend/knowledge and embeds new or changed files ({ force: true } re-embeds all). */
router.post("/reindex", asyncHandler(async (req, res) => {
  res.json(await store.indexAll({ force: !!req.body?.force }));
}));

/** Lets an admin try retrieval directly: { query, module? }. */
router.post("/search", asyncHandler(async (req, res) => {
  if (!req.body?.query) return res.status(400).json({ error: "query is required" });
  res.json({ passages: await store.search(req.body.query, { module: req.body.module, topK: req.body.top_k }) });
}));

export default router;
