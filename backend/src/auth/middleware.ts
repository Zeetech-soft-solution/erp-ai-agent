import { Request, Response, NextFunction } from "express";
import { verifySessionId } from "./jwt";
import { sessionStore } from "../core/sessionStore";
import { Session } from "../core/types";

export interface AuthedRequest extends Request {
  session?: Session;
  sessionId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing bearer token" });

  let sessionId: string;
  try {
    sessionId = verifySessionId(header.slice(7));
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const session = sessionStore.get(sessionId);
  if (!session) return res.status(401).json({ error: "Session expired or unknown — please sign in again" });

  // Non-mutating: attaches this request's own sessionId onto the Session
  // object itself (see core/types.ts's Session.sessionId doc comment) so
  // sessionCacheProvider can key chat memory per login/tab, not per user.
  req.session = { ...session, sessionId };
  req.sessionId = sessionId;
  next();
}
