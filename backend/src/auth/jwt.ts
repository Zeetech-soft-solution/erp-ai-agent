import jwt from "jsonwebtoken";
import { appConfig } from "../config/app.config";

/**
 * The JWT now carries ONLY an opaque sessionId — see core/sessionStore.ts
 * for why the real UserCredential deliberately never goes in here.
 */
export function issueAgentToken(sessionId: string): string {
  // expiresIn's stricter template-literal type (e.g. "8h") vs our plain
  // env-sourced string is a typing-only mismatch — the runtime value is
  // still valid input for jsonwebtoken.
  return jwt.sign({ sessionId }, appConfig.jwt.secret, { expiresIn: appConfig.jwt.expiresIn as jwt.SignOptions["expiresIn"] });
}

export function verifySessionId(token: string): string {
  const payload = jwt.verify(token, appConfig.jwt.secret) as { sessionId: string };
  return payload.sessionId;
}
