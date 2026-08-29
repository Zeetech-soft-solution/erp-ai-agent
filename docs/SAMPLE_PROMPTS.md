# Sample prompts — CRM module

Prompts confirmed to work against this tier's real, working capability: the CRM module
(leads, contacts, opportunities, customers, territories, the lead-qualification workflow,
and the analytics tools), granted to the **Sales User** role — see `config/roles.policy.ts`
for the exact tool list and `docs/ARCHITECTURE.md` for how it's built.

These assume you're signed in against a real, connected ERPNext instance (Step 3 of
`docs/INSTALL.md`) — the agent always answers from your live data, not from the static
`sample-data/crm-sample-data.json` snapshot (see that file's own note for what it's for
instead).

## Listing and lookup

- "Show me our leads"
- "List leads from [company name]"
- "Get the details of lead CRM-LEAD-2026-00001" *(use a real id from your own instance)*
- "Show me our customers"
- "List territories"
- "Show me the contact for [customer name]"

## Counts and totals — routed through the analytics tools, never eyeballed

- "How many open leads do we have?"
- "What's our total open opportunity value?"
- "Break down opportunity value by territory"
- "What percentage of leads are still untouched?"

## Creating and updating — routed through the business-rule engine and a confirm-before-create step

Rule definitions ship empty in this distribution — add your own `RuleSet`s under
`config/modules/<module>/rule/` and they run at this point automatically.

- "Create a lead for Aisha Kapoor, email aisha@example.com"
- "Create a contact for Jane at jane@x.com"
- "Create an opportunity for [customer name], amount 50000"

## The lead-qualification workflow

- "Mark lead CRM-LEAD-2026-00001 as interested" *(lead_qualification.qualify)*
- "Disqualify lead CRM-LEAD-2026-00001" *(lead_qualification.disqualify)*
- Converting a qualified lead (`lead_qualification.convert`) requires the **Sales
  Manager** or **System Manager** role — signed in as a plain Sales User, this is a good
  way to see the workflow engine's own double-gate (`transition.allowedRoles`) refuse the
  action with a real, specific message rather than a generic permission error.

## What's deliberately out of scope here

Address records (the one CRM entity held back in this tier), quotations, sales orders,
and every other standard ERP module are present as real, complete folder scaffolding
(`config/modules/<name>/`) with no business content behind them yet — a prompt that needs
one of those gets an honest "I don't have a tool for that" rather than a fabricated answer.
See `docs/ARCHITECTURE.md` for how to populate one following the CRM module's own pattern.
