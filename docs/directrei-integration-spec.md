# DirectREI ↔ War Room — Write API spec

**Goal:** let the War Room (Freedom Offers' CRM) launch a buyer Deal Blast through
DirectREI's existing dialer / email / SMS automations — so the deal and the vetted
buyer list that already live in the War Room don't have to be rebuilt by hand in a
DirectREI campaign every time.

The War Room already reads DirectREI (`/me`, `/contacts`, `/campaigns`, `/deals`).
This adds **four write capabilities**. Auth is the same bearer key we use today
(`Authorization: Bearer <DIRECTREI_API_KEY>`), same base URL.

All the War Room needs is for these four endpoints to exist and behave as below.
Field names are a suggestion — if yours differ, just tell us the shapes and we map.

---

## 1. Create a campaign
`POST {BASE}/campaigns`

```json
{
  "name": "Deal Blast — 123 Main St (War Room)",
  "channels": ["sms", "email", "cold_call"],
  "source": "war-room",
  "message": {
    "sms": "🏞 Land available: 123 Main St — asking $120,000 · 2.5 ac. Cash/fast close. Interested? Reply here.",
    "email_subject": "Off-market land: 123 Main St (2.5 ac)",
    "email_body": "<full packet message / HTML>"
  },
  "launch": false
}
```
**Returns:** `{ "id": "<campaign_id>", "status": "draft" }`

- `channels` picks which of your automations run (any subset of sms / email / cold_call).
- If `launch: true`, create + launch in one call (then step 3 is optional).

## 2. Add contacts to a campaign
`POST {BASE}/campaigns/{id}/contacts`

```json
{
  "contacts": [
    { "name": "Jane Buyer", "phone": "+19095551234", "email": "jane@example.com", "external_id": "opp_abc:buyer_123" },
    { "name": "ACME Land LLC", "phone": "+18585559876", "email": "deals@acme.com", "external_id": "opp_abc:buyer_456" }
  ]
}
```
**Returns:** `{ "added": 2, "skipped": 0 }`

- `external_id` is **our** id for that buyer on that deal (`<oppId>:<buyerId>`). Please
  store it and echo it back on webhook events (section 4) so we can match replies to
  the exact deal + buyer. This is the single most important field for the loop to close.
- De-dupe on phone/email is fine; just report `skipped`.

## 3. Launch a campaign
`POST {BASE}/campaigns/{id}/launch`
**Returns:** `{ "id": "<campaign_id>", "status": "launched", "queued": 140 }`

- Starts the sms / email / cold_call automations for the campaign's contacts.

## 4. Per-contact event webhook  *(the part that makes it two-way)*
`POST` to a War Room URL we give you (e.g. `https://kpi-tracker-lovat.vercel.app/api/directrei/events`),
one call per event, with a shared secret header `X-DirectREI-Signature` (or a token
in the body — your call):

```json
{
  "event": "replied",            // sent | delivered | opened | replied | call_completed | opted_out | bounced
  "campaign_id": "<campaign_id>",
  "channel": "sms",              // sms | email | cold_call
  "external_id": "opp_abc:buyer_123",
  "contact": { "phone": "+19095551234", "email": "jane@example.com" },
  "detail": "Interested — what's the bottom line?",   // reply text / call disposition, when available
  "at": "2026-10-22T18:04:00Z"
}
```

- `external_id` echoed from section 2 is what lets us drop the event straight onto the
  right deal's buyer tracker + offers panel.
- If a true webhook is hard, a `GET {BASE}/campaigns/{id}/events?since=<iso>` we can poll
  works too — tell us which and we'll build to it.

---

## What the War Room does with this
1. Dispo opens a deal → clicks **Arm & launch Deal Blast** (one click, human-reviewed).
2. War Room calls **1 → 2 → 3**: creates the campaign with the matched vetted buyers +
   the ready packet message, and launches your automations. No manual list rebuild.
3. Your **webhook (4)** streams engagement back; the War Room shows opens/replies/call
   outcomes on that deal's buyer tracker and auto-feeds the 3-offer tracker.

---

## 5. Deal / property landing page  *(optional — you already have a site builder)*
You already build websites in DirectREI; we'd love to generate a **public page per deal**
(the "deal room" buyers open) from the War Room and get its URL back.

`POST {BASE}/pages`  *(or whatever your site builder exposes)*
```json
{
  "type": "deal",
  "external_id": "opp_abc",
  "property": { "address": "123 Main St", "apn": "123-456-789", "acres": "2.5",
                "price": 120000, "features": ["Paved road frontage", "Creek"], "photos": ["https://…"] },
  "cta": "offer_form"         // a built-in "make an offer" form that posts back to the webhook (section 4)
}
```
**Returns:** `{ "url": "https://…/deal/123-main-st", "page_id": "…" }`

- If offers submitted on that page come back through the **section-4 webhook** as
  `event: "offer_submitted"` with the price/terms, the War Room drops them straight onto
  the deal's offer tracker — fully closing the loop.
- If a page API isn't exposed, no problem — tell us and we'll build the deal room on our side.

---

## Open questions for you
- Are SMS numbers A2P 10DLC-registered on your side, or do we register ours?
- Any rate / volume caps per campaign we should respect?
- Do you want `external_id` namespaced (e.g. prefixed `fo_`) to avoid collisions?
- Can the site builder be driven by API (section 5), or is it UI-only today?
