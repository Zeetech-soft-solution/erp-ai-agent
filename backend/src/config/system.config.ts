import { SystemConnector } from "../core/types";
import { ErpNextConnector } from "../erpnext/erpnextConnector";
import { appConfig } from "./app.config";

/**
 * ONE switch point for which business system this agent talks to.
 * Adding a second business system tomorrow — SAP, a healthcare EMR, a
 * banking core, a logistics TMS, anything with entities/roles/workflows —
 * is: write <system>/xConnector.ts implementing SystemConnector (see
 * sap/README.md for the checklist), add it to PROVIDERS below, flip
 * SYSTEM_PROVIDER in .env. Every module, the gateway, roles, the
 * reasoning engine, and the workflow engine never change — they only
 * ever import `systemConnector` from here.
 */
const PROVIDERS: Record<string, () => SystemConnector> = {
  erpnext: () => new ErpNextConnector(),
  // sap: () => new SapConnector(),
};

const factory = PROVIDERS[appConfig.system.provider];
if (!factory) {
  throw new Error(`Unknown SYSTEM_PROVIDER "${appConfig.system.provider}" — check config/system.config.ts`);
}

export const systemConnector: SystemConnector = factory();
