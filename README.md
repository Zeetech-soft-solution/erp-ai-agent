# ERP Agent AI (Free / Open Core)

An extensible, role-based AI agent for ERP AI integration systems. This is the **free, open-source tier**:
the complete core engine (module registry, entity/workflow/report factories, auth, context
assembly, LLM tool-calling loop) plus a working reference connector for ERPNext, with a
real, fully working **CRM module** wired end to end for the **Sales User** role — leads,
contacts, opportunities, customers, and territories, a real lead-qualification workflow,
business-rule validation (required contact info, duplicate-record warnings, manager-gated
conversion), and the analytics tools (exact sums/counts/averages/correlations, never
model-estimated) — plus the folder shape for every other standard ERP module (Selling,
Buying, Stock, Accounting, HR, Manufacturing, Projects) present and ready to extend the
same way. Sample data and prompts: `sample-data/`, `docs/SAMPLE_PROMPTS.md`.

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

## Screenshots

Real output from the [live Pro demo](https://noviz.in/agent/login) (Accounts Manager role, signed in
against a real ERPNext instance) — this is the same tool-calling/reporting architecture this repo's
core implements, shown here running with Pro's full accounting module coverage rather than this
repo's CRM module.

| Outstanding invoice aging | Multi-chart dashboard (pie + bar + line) |
|---|---|
| ![Outstanding customer invoice aging report, listing overdue customers with amounts and days overdue](docs/screenshots/accounting-aging-report.jpg) | ![A composed sales dashboard: a pie chart of quotations by status, a bar chart of sales orders by status, and a line chart of monthly sales invoice totals, all generated from one request](docs/screenshots/pro-chart-dashboard.jpg) |

📝 **Write-up:** [AI Agents in the Enterprise: Building Smarter ERP Dashboards with Purpose-Built Tools](https://dev.to/tajdin_k_27861e95a3d49baa/-1k1) — the architecture behind the dashboard screenshot above: fetch/shape/render as three separate, composable tools instead of one model call doing everything.

## What's here vs. what's not

Every module folder exists under `backend/src/config/modules/` and
`backend/src/erpnext/entityMaps/`, but only one is actually populated: CRM — customer,
opportunity, contact, and territory entities (plus `lead`, hand-written for its own
qualify/convert logic), real business rules, and a working lead-qualification workflow.
Every other module's `entities.ts`/`rules.ts`/`training.ts` is present but exported empty,
on purpose — the folder shape is real and complete, the business content isn't. The point
of this repo is the **pattern**: how core stays 100% ERP-agnostic, and how a new module or
a new connector (SAP, another ERP) plugs in without touching existing code (see
`docs/ARCHITECTURE.md`).

A private, paid tier ([erp-agent-pro](https://noviz.in)) built on this same core expands
every module to full ERPNext doctype/API coverage and adds additional connectors. It is not
part of this repository — see the callout above.

## License

AGPL-3.0 (see `LICENSE`). If you run a modified version of this code as a network
service, you must make your modified source available to your users under the same
license.

## Structure

```
backend/       Node/TypeScript API server (core engine, config, connectors, routes)
frontend/
  admin/       Admin console (Vite + React)
  agent/       End-user chat/agent UI (Vite + React)
docs/          Architecture, install guide, testing guide, sample prompts, training plan
sample-data/   A real, small CRM data snapshot — see sample-data/README.md
```

## Getting started

```bash
cd backend && npm install && cp .env.example .env && npm run dev
cd frontend/admin && npm install && cp .env.example .env && npm run dev
cd frontend/agent && npm install && cp .env.example .env && npm run dev
```

See `docs/INSTALL.md` for the full step-by-step install (backend, database, admin console,
agent app, ERPNext connector — including installing ERPNext itself and backing up/restoring
its data), `docs/ARCHITECTURE.md` for how modules, entities, and connectors fit together,
`docs/TESTING_GUIDE.md` for the condensed version of the same install aimed at developers
who just want it running, and `docs/SAMPLE_PROMPTS.md` for prompts to try once it's up.
