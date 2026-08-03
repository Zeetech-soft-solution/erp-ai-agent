import { Router, Request } from "express";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { appConfig } from "../config/app.config";
import { entityKeyForDoctype, toCanonicalRow } from "../erpnext/entityMap";
import { alertStore } from "../core/alertStore";
import { asyncHandler } from "../core/asyncHandler";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Inbound webhooks FROM ERPNext (opposite direction from every other
 * route in this backend, which calls OUT to ERPNext). Unauthenticated
 * in the Bearer-JWT sense — ERPNext can't send our agent's session
 * token — but verified via HMAC signature instead. Only ERPNext is
 * wired up today; a future SAP (or other) inbound webhook would get
 * its own path here, translated through its own entity map the same
 * way.
 */
function isValidSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
  if (!appConfig.erpnext.webhookSecret || !rawBody || !signatureHeader) return false;
  const expected = createHmac("sha256", appConfig.erpnext.webhookSecret).update(rawBody).digest("base64");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}

const router = Router();

router.post("/erpnext/:doctype", asyncHandler(async (req: RawBodyRequest, res) => {
  const signatureHeader = req.headers["x-frappe-webhook-signature"];
  if (!isValidSignature(req.rawBody, Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader)) {
    return res.status(401).json({ error: "Invalid or missing webhook signature" });
  }

  const entityKey = entityKeyForDoctype(req.params.doctype);
  if (!entityKey) {
    return res.status(400).json({ error: `No entity mapping for doctype "${req.params.doctype}"` });
  }

  const canonical = toCanonicalRow(entityKey, req.body);
  if (!canonical.owner) {
    // Nothing to notify — accept the webhook so ERPNext doesn't retry
    // forever, but there's no user to queue an alert for.
    return res.json({ ok: true, delivered: false });
  }

  await alertStore.push(canonical.owner, {
    id: randomUUID(),
    entityKey,
    recordId: canonical.id,
    message: `New ${entityKey}: ${canonical.display_name || canonical.id} (status: ${canonical.status || "unknown"})`,
    createdAt: new Date().toISOString(),
  });

  res.json({ ok: true, delivered: true });
}));

export default router;
