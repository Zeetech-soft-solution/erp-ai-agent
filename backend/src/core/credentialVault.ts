import crypto from "crypto";
import { appConfig } from "../config/app.config";

/**
 * AES-256-GCM encrypt/decrypt for secrets stored at rest (currently:
 * user_credentials.api_secret_enc). CREDENTIAL_ENCRYPTION_KEY must be a
 * 32-byte key, base64-encoded, in .env — generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Rotating this key invalidates every stored credential (they'd need
 * re-provisioning) — treat it with the same care as a database password,
 * and never commit it.
 */
function getKey(): Buffer {
  const raw = appConfig.security.credentialEncryptionKey;
  if (!raw) throw new Error("CREDENTIAL_ENCRYPTION_KEY is not set — required to store/read user credentials");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return key;
}

export function encryptSecret(plaintext: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptSecret(blob: Buffer): string {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
