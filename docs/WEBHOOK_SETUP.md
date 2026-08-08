# ERPNext webhook setup — Lead alerts (pattern reference)

**Note**: Lead isn't a live capability in this tier (`crmModule.tools` is empty —
see `docs/ARCHITECTURE.md`), so this specific example won't produce visible
alerts today. It's kept as the worked reference for the mechanism itself,
which is real and wired regardless of which entity uses it. Point it at
`quotation` instead (the one live entity) by using an owner-equivalent
field from `erpnext/entityMaps/selling.ts` — the webhook route itself is
already generic, see step 4.

How to configure ERPNext to push a proactive chat alert to a lead's owner via
`POST /api/webhooks/erpnext/:doctype` (see `backend/src/routes/webhooks.routes.ts`). Delivered to
the browser by polling `GET /api/agent/alerts` every ~15s — see `docs/TRAINING_PLAN.md`-adjacent
note in `core/alertStore.ts` for why polling was chosen over SSE/WebSocket.

## 1. Generate a webhook secret

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set it as `ERPNEXT_WEBHOOK_SECRET` in the agent backend's `.env`.

## 2. Create the Webhook record in ERPNext

In ERPNext: **Settings → Integrations → Webhook → New**

| Field | Value |
|---|---|
| Doctype | `Lead` |
| Doc Event | `After Insert` (create a second Webhook with `On Update` if you also want update alerts) |
| Request URL | `https://<your-agent-host>/api/webhooks/erpnext/Lead` |
| Request Method | `POST` |
| Webhook Secret | the same value as `ERPNEXT_WEBHOOK_SECRET` above |
| Enabled | checked |

## 3. Webhook Data — required fields

Under **Webhook Data**, make sure at least these fieldnames are included (they're what
`erpnext/entityMaps/crm.ts`'s Lead mapping translates into an alert):

- `name`
- `lead_name`
- `email_id`
- `status`
- `lead_owner` — this is who the alert gets queued for; a Lead with no owner set produces no alert
  (the webhook still returns `200 {ok:true, delivered:false}` so ERPNext doesn't retry it forever)

If Webhook Data is left empty, ERPNext sends the full document, which also works — the extra
fields are just ignored by `toCanonicalRow`.

## 4. Add more doctypes later

To cover another doctype, add its entity mapping's `fieldMap` entry for `owner` (or whichever
field should receive the alert) if it isn't there yet, then repeat steps 2–3 with that doctype's
name — no code changes needed, `entityKeyForDoctype` and the webhook route are already generic.
