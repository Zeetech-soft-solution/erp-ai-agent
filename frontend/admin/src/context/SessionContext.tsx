import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

interface SessionInfo {
  email: string;
  roles: string[];
  isDemo: boolean;
}

// Every write-capable admin page reads isDemo from here instead of
// re-fetching /api/auth/me itself — one request per page load, shared.
// The backend enforces the actual block/redaction (routes/admin.routes.ts)
// regardless of what this says; this is only for the UI to decide
// whether to attempt a save or show the disabled message up front.
const SessionContext = createContext<SessionInfo | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    api.getMe().then(setSession).catch(() => setSession(null));
  }, []);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Defaults to isDemo: true (the safer assumption) until /api/auth/me
 *  resolves, so nothing briefly renders as "real admin, go ahead and
 *  save" during that first render. */
export function useSession(): SessionInfo {
  const ctx = useContext(SessionContext);
  return ctx || { email: "", roles: [], isDemo: true };
}
