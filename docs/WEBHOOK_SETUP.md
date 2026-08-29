# ERPNext webhook setup — Lead alerts

Lead is a real, live capability in this tier (see the CRM module in
`docs/ARCHITECTURE.md`), so this example produces real, visible alerts —
not just a pattern reference. The webhook route itself
(`backend/src/routes/webhooks.routes.ts`) is generic across any entity;
this doc uses Lead since it's the one this tier's `owner`-equivalent field
mapping (`erpnext/entityMaps/crm.ts`) is already set up for.

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
