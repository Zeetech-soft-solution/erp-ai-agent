import { Router } from "express";
import multer from "multer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { requireAuth, AuthedRequest } from "../auth/middleware";
import { requireAdmin } from "../auth/adminMiddleware";
import { asyncHandler } from "../core/asyncHandler";
import { PolicyDocumentStore } from "../core/policyDocumentStore";
import { embedder } from "../bootstrap";

const store = new PolicyDocumentStore(embedder);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", asyncHandler(async (_req, res) => {
  res.json({ documents: await store.list() });
}));

/**
 * Extracts plain text from an uploaded policy/reference document.
 * Branches on file extension (not just mimetype - browsers send
 * inconsistent mimetypes for .docx/.pdf depending on OS/browser,
 * extension is the reliable signal here) - added 2026-08-09, PDF was
 * the real gap: SOPs/vendor contracts/return-policy documents are far
 * more often PDFs than Word docs in practice.
 */
async function extractText(file: Express.Multer.File): Promise<string> {
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      // result.text pre-joins pages with a "-- N of M --" marker, which
      // is pdf-parse UI/debug furniture, not real document content - it
      // would otherwise get embedded as noise in every multi-page PDF.
      // result.pages[].text is the clean per-page text; join with a
      // blank line so chunkText's paragraph splitter treats a page break
      // the same as any other paragraph boundary (confirmed live: a
      // single-page test PDF's clean text is just "Hello PDF Test", vs.
      // result.text's "Hello PDF Test\n\n-- 1 of 1 --\n\n").
      return result.pages.map((p) => p.text).join("\n\n");
    } finally {
      await parser.destroy();
    }
  }
  // .docx (and anything else) falls through to mammoth, the pre-existing
  // behavior - mammoth itself throws a clear error on a genuinely
  // unsupported format, which the caller already surfaces as a 400.
  const { value } = await mammoth.extractRawText({ buffer: file.buffer });
  return value;
}

/**
 * Admin uploads a .docx or .pdf as the initial version of a policy/
 * reference document (business policy, workflow rules, ...). Text is
 * extracted (mammoth for .docx, pdf-parse for .pdf), chunked, and
 * embedded into context_embeddings so it surfaces as normal WARM
 * context on future prompts — see core/policyDocumentStore.ts. Editing
 * afterward (PUT /:id) never requires re-uploading a file.
 */
router.post("/", upload.single("file"), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required (.docx or .pdf)" });
  const title = (req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });

  const text = await extractText(req.file);
  if (!text.trim()) return res.status(400).json({ error: "No text could be extracted from this document" });

  const doc = await store.create({
    title,
    module: req.body.module || null,
    filename: req.file.originalname,
    text,
    uploadedBy: req.session!.sub,
  });
  res.status(201).json({ document: doc });
}));

router.put("/:id", asyncHandler(async (req: AuthedRequest, res) => {
  const { title, module, text } = req.body;
  const doc = await store.update(req.params.id, { title, module, text });
  if (!doc) return res.status(404).json({ error: "Policy document not found" });
  res.json({ document: doc });
}));

router.put("/:id/active", asyncHandler(async (req: AuthedRequest, res) => {
  if (typeof req.body.active !== "boolean") return res.status(400).json({ error: "active must be boolean" });
  const ok = await store.setActive(req.params.id, req.body.active);
  if (!ok) return res.status(404).json({ error: "Policy document not found" });
  res.json({ ok: true });
}));

router.delete("/:id", asyncHandler(async (req: AuthedRequest, res) => {
  const ok = await store.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: "Policy document not found" });
  res.json({ ok: true });
}));

export default router;
