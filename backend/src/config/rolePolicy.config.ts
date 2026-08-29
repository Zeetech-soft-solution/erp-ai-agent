import { RolePolicyProvider } from "../core/types";
import { StaticRolePolicyProvider } from "./roles.policy";
import { appConfig } from "./app.config";

/**
 * Mirrors system.config.ts's own switch point, deliberately keyed off
 * the SAME SYSTEM_PROVIDER env var: a role-policy provider only ever
 * makes sense paired with the SystemConnector whose role names it
 * understands (StaticRolePolicyProvider's ROLE_TOOL_MAP keys are real
 * ERPNext role names — see roles.policy.ts's own header comment), so
 * the two should always swap together, not be selected independently.
 * Adding a second business system's role policy tomorrow — SAP, Odoo,
 * whatever — is: write a RolePolicyProvider implementation with THAT
 * system's own role names as keys, add it to PROVIDERS below. Nothing
 * that imports `rolePolicy` (auth/erpnextAuth.ts today) ever changes.
 */
const PROVIDERS: Record<string, () => RolePolicyProvider> = {
  erpnext: () => new StaticRolePolicyProvider(),
  // sap: () => new SapRolePolicyProvider(),
};

const factory = PROVIDERS[appConfig.system.provider];
if (!factory) {
  throw new Error(`Unknown SYSTEM_PROVIDER "${appConfig.system.provider}" — check config/rolePolicy.config.ts`);
}

export const rolePolicy: RolePolicyProvider = factory();
