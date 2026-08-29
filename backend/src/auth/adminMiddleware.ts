import { Response, NextFunction } from "express";
import { AuthedRequest } from "./middleware";
import { appConfig } from "../config/app.config";

/**
 * Admin access is a SEPARATE check from tool permissions — settings
 * CRUD isn't an MCP tool the LLM ever calls, so it doesn't belong in
 * roles.policy.ts / allowed_tools. It's a plain role allow-list, kept
 * here so it's obvious this is a different trust boundary from the
 * agent's tool gateway.
 */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const roles = req.session?.erpnext_roles || [];
  const isAdmin = roles.some((r) => appConfig.adminRoles.includes(r));
  if (!isAdmin) return res.status(403).json({ error: "Admin access required" });
  next();
}
