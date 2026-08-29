/**
 * Free tier is single-tenant, self-hosted — no tenant registry. The
 * assistant still represents "a real company" in its identity prompt, so
 * we carry a tiny local shape instead of the platform's Tenant row.
 */
export interface AppIdentity {
  name: string;
}

export interface SystemPromptOptions {
  prompt: string;
  canWrite: boolean;
  identity: AppIdentity;
  frappeUser: string;
  frappeRoles: string[];
}

export interface ModulePromptSection {
  id: string;
  content: string;
  appliesTo: string[]; // Module names this applies to
}
