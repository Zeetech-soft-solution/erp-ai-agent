# CRM sample data

`crm-sample-data.json` is a real, small snapshot (leads, opportunities, customers,
territories) pulled from this project's own reference demo company — Sunrise Electronics,
a fictional company with entirely synthetic data generated for development and testing,
not a real business. It's a reference for the shape and volume of data the CRM module
(`config/modules/crm/`, `modules/crm/`) is built and tested against — useful if you're
setting up your own ERPNext instance and want a concrete example of what a realistic Lead,
Opportunity, or Customer record looks like, rather than something this repo loads or
imports automatically.

It also stands in for the real business rules this module enforces
(`config/modules/crm/rules.ts`) and the kind of end-to-end testing that went into them —
required-contact-method checks, duplicate-lead warnings, manager-gated lead conversion —
all exercised against data shaped like this during development, both as automated tests
(`backend/src/**/__tests__/`) and live against a real running ERPNext instance.

See `docs/SAMPLE_PROMPTS.md` for prompts to try against your own connected instance, and
`docs/ARCHITECTURE.md` for how to extend this module or add a new one following the same
pattern.
