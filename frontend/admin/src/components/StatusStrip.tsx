import { useEffect, useState } from "react";
import { api } from "../api/client";

interface ModuleStatus { name: string; tool_count: number; }

/**
 * The one "signature" element of this console — real signal pulled
 * from /api/admin/status, showing which MCP modules actually loaded
 * on the running backend. Not decorative: if a module you expect isn't
 * here, it means ACTIVE_MODULES in .env doesn't include it.
 */
export function StatusStrip() {
  const [modules, setModules] = useState<ModuleStatus[]>([]);

  useEffect(() => {
    api.getStatus().then((r) => setModules(r.modules)).catch(() => {});
  }, []);

  if (!modules.length) return null;

  return (
    <div className="status-strip">
      {modules.map((m) => (
        <span key={m.name} className="status-pill">
          <span className="dot" />
          {m.name} · {m.tool_count} tools
        </span>
      ))}
    </div>
  );
}
