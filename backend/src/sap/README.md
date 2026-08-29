# Adding a second business system (SAP, or anything else)

This folder is a template for the *next* `SystemConnector`. Nothing
about this pattern is ERP-specific — the same steps work for a
healthcare EMR, a banking core system, a logistics TMS, or an
in-house system, because `SystemConnector` only assumes a business
system has: things you can list/get/create/update, users with roles,
and a way to verify credentials. That's it.

1. `sap/entityMap.ts` — same shape as `erpnext/entityMap.ts`: for each
   canonical entityKey ("lead", "sales_order", ...) declare which SAP
   object/BAPI/OData entity it maps to, and a `fieldMap` from canonical
   field names to SAP's native field names.
2. `sap/sapConnector.ts` — implement `SystemConnector` (see
   `core/types.ts`): `loginWithPassword`, `loginWithApiKey`,
   `getUserRoles`, `list`, `get`, `create`, `update`. Every
   list/get/create/update call receives a `UserCredential` and must act
   AS that person on SAP's side (whatever SAP's equivalent of a session
   or personal API key is) — never a shared service account, so SAP's
   own change history/audit trail attributes actions to the real user.
   Internally this can call SAP OData services, RFC/BAPI, or whatever
   integration method you use — that detail never leaves this file.
3. In `config/system.config.ts`, add `sap: () => new SapConnector()`
   to `PROVIDERS`, and set `SYSTEM_PROVIDER=sap` in `.env`.
4. Update `config/entities.config.ts` if the new system's canonical
   field coverage differs — `EntityConfig.canonicalFields` is shared
   across every system, so keep it to fields every intended system can
   actually supply, or handle missing fields gracefully in the connector.
5. If the new domain needs its own approval/process logic, add its
   state machines to `config/workflows.config.ts` the same way — see
   `core/workflowEngine.ts`. Workflows are as system-agnostic as
   entities: they operate purely on canonical fields through
   `systemConnector`.

Nothing in `core/`, `modules/crm/`, `core/entityModuleFactory.ts`,
`core/workflowEngine.ts`, `core/gateway.ts`, `core/reasoningEngine.ts`,
or any route needs to change. That's the entire point of the boundary.
