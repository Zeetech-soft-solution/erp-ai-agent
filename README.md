# ERP Agent (Free / Open Core)

An extensible, role-based AI agent for ERP systems. This is the **free, open-source tier**:
the complete core engine (module registry, entity/workflow/report factories, auth, context
assembly, LLM tool-calling loop) plus a working reference connector for ERPNext, with one
real, fully working capability wired end to end (`quotation.list`, for the **Sales User**
role) and the folder shape for every other standard ERP module (CRM, Selling, Buying,
Stock, Accounting, HR, Manufacturing, Projects) present but intentionally left as empty
configuration — enough to see the whole architecture, not just one slice of it.

> [!TIP]
> **Looking for the full-depth product?** **erp-agent-pro** is the paid tier, built on this
> exact same open core foundation — no separate fork, only extended capabilities. It takes
> standard ERP modules beyond basic field mappings, adding deeper business-process logic,
> domain-specific rules, workflows, validations, and operational capabilities. It provides
> an extensive MCP tool layer across supported modules and includes a dedicated
> training-data pipeline for each functional domain.
>
> The ERPNext connector in this repository is the reference implementation of the
> integration pattern used by Pro to connect ERP-specific business capabilities to any ERP
> instance — ERPNext today, other ERP platforms tomorrow — without modifying the underlying
> core.
>
> 🔗 **[noviz.in](https://noviz.in)** — product info · 🚀 **[Live demo of Pro](https://noviz.in/agent/login)** — sign in with a demo account and try it against a real, running ERP.

## What's here vs. what's not

Every module folder exists under `backend/src/config/modules/` and
`backend/src/erpnext/entityMaps/`, but only one is actually populated: Selling, with a
single entity (`quotation`) and a single operation (`list`). Every other module's
`entities.ts`/`rules.ts`/`training.ts` is present but exported empty, on purpose — the
folder shape is real and complete, the business content isn't. The point of this repo is
the **pattern**: how core stays 100% ERP-agnostic, and how a new module or a new connector
(SAP, another ERP) plugs in without touching existing code (see `docs/ARCHITECTURE.md`).

A private, paid tier ([erp-agent-pro](https://noviz.in)) built on this same core expands
every module to full ERPNext doctype/API coverage and adds additional connectors. It is not
part of this repository — see the callout above.

## License

AGPL-3.0 (see `LICENSE`). If you run a modified version of this code as a network
service, you must make your modified source available to your users under the same
license.

## Structure

```
backend/    Node/TypeScript API server (core engine, config, connectors, routes)
frontend/
  admin/    Admin console (Vite + React)
  agent/    End-user chat/agent UI (Vite + React)
docs/       Architecture, testing guide, training plan
```

## Getting started

```bash
cd backend && npm install && cp .env.example .env && npm run dev
cd frontend/admin && npm install && cp .env.example .env && npm run dev
cd frontend/agent && npm install && cp .env.example .env && npm run dev
```

See `docs/ARCHITECTURE.md` for how modules, entities, and connectors fit together, and
`docs/TESTING_GUIDE.md` for how to exercise the running system.
