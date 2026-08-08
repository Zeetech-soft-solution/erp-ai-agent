# Training Plan — from logged interactions to your own model

Phased, starting from what's already wired in this scaffold
(`interaction_log` table + `InteractionLogger` on every reasoning-engine
run) through to eventually replacing the external LLM.

## Phase 0 — already active (do nothing extra)
Every `/api/agent/prompt` call logs: prompt, roles, which context
sources were used (labels only), which tools were called (with their
real arguments), response type/render kind, and latency. This starts
accumulating from day one — intentionally, so you never have a gap to
backfill later.

A second, parallel table, `rule_evaluations` (see
`core/businessRuleEngine.ts` / `core/ruleOutcomeLogger.ts`), logs every
business-rule check — which rule fired, whether it blocked or just
warned, on what arguments. This tier ships one reference rule
(`quotation.warn_duplicate_open` in `config/modules/selling/rules.ts`) as
a worked example; real rule coverage across modules is a pro-tier
capability. Same safe-no-op-without-`DATABASE_URL` behavior, same
"never delete casually" status as `interaction_log`.

**Action now**: nothing code-wise. Just don't skip setting `DATABASE_URL`
once you deploy — the logger is a safe no-op without it, which is
useful for local dev but means no data collection until it's set.

## Phase 1 — close the feedback loop (near-term, small addition)
Add a thumbs up/down on each agent response in the UI, writing back to
`interaction_log.feedback` (`-1` / `+1` / `null`). This turns raw logs
into *labeled* examples of good vs. bad tool decisions — far more
valuable for training than logs alone. No architecture change needed:
one new small route (`POST /api/agent/feedback/:interactionId`) and
one UI control.

## Phase 2 — dataset curation (once you have a few weeks of real usage)
Two datasets fall out of the same log table, for two different purposes:

1. **Orchestration-policy dataset**: `(prompt, role, context_used) -> tool_calls`.
   This is the narrower, more learnable problem — essentially "given
   this request and this role, which tool(s) should fire, in what
   order." Good candidate for fine-tuning or even a smaller
   classifier/router model, since it doesn't require full conversational
   fluency.
2. **Full-response dataset**: `(prompt, context, tool results) -> final
   message + display intent`, filtered to `feedback = +1` rows (or
   manually reviewed) as your quality bar.

Curate by exporting from `interaction_log`, deduplicating near-identical
prompts, and stratifying by role/module so no single heavy user or
module dominates the set.

## Phase 3 — first fine-tune / distillation
Start with the **orchestration-policy** dataset — it's smaller, safer,
and immediately useful even while you keep an external LLM for the
actual conversational reasoning:
- Fine-tune or distill a lightweight model whose only job is tool
  selection, sitting *in front of* the full LLM call — if it's
  confident, skip straight to `gateway.callTool()`; if not, fall back
  to the full `ReasoningEngine` loop. This cuts cost/latency for the
  common cases without touching correctness for edge cases.

Only after that's stable do you tackle the harder problem: fine-tuning
or training a model for the full reasoning + response-generation role,
using the full-response dataset.

## Phase 4 — replacing the external LLM
Once you have a model you trust for orchestration (and later, full
reasoning), it plugs in exactly where any other model would: implement
`LLMProvider` (`providers/llm/yourModelProvider.ts`), point
`routes/agent.routes.ts` at it. Nothing in `reasoningEngine.ts`,
`gateway.ts`, or any module needs to change — this was the point of the
provider abstraction from the start.

## Data governance notes worth deciding early
- `context_sources_used` stores labels, not raw content, specifically so
  the log table doesn't become a second copy of sensitive ERP/email data.
- Consider a retention policy per role/module once volume grows (e.g.
  email-related interactions may need shorter retention than CRM ones).
- Before any fine-tuning run, strip/pseudonymize customer-identifying
  fields from `tool_calls` args — the schema doesn't do this
  automatically today, worth adding as a curation step in Phase 2.
