# War Room — Vetted Buyers, round 2 (BUILD_SPEC_2 v1 · 2026-10-01)

**For:** Claude Code in this repo. Same rules as BUILD_SPEC.md §0 (archive-only, history on every write, additive migrations, backup before data changes, no deletes — ever). Read BUILD_SPEC.md §0 again before starting. Execute phases in order; `npm run build` + commit after each; print a 5-line summary and wait for Jon's "go".

Already in place (don't rebuild): structured buy box + geocoder (Phase 2), Section 3 scorecard/tiers/cards/coverage (`src/lib/buyers/scorecard.ts`, `BuyerCards.tsx`, `VettedBuyersBoard.tsx`), email ping-tree cascade (`src/lib/cascade.ts`), deal land fields (`src/lib/deal-land.ts`), Deal model with `status: under_contract → …`.

---

## Phase 7 — Deal sends + feedback loop + lowball detection

### 7.1 Prisma (additive)
```prisma
model DealSend {
  id          String   @id @default(cuid())
  dealId      String
  buyerId     String
  buyer       MarketContact @relation(fields: [buyerId], references: [id])
  sentAt      DateTime @default(now())
  channel     String   @default("email")   // email | text | call | portal
  wave        Int      @default(1)         // cascade round
  packetUrl   String   @default("")
  floorPrice  Float?                       // our contract/floor at send time
  askPrice    Float?                       // what we marketed it at (if any)
  // response
  respondedAt DateTime?
  outcome     String   @default("")        // "" | no_reply | pass | offer | loi | closed
  offerAmount Float?
  passReason  String   @default("")        // price | acres | area | timing | type | other
  note        String   @default("")
  actor       String   @default("")
  @@index([buyerId, sentAt])
  @@index([dealId])
}
```
Add to `MarketContact` (additive): `buyerFlags Json?` (computed cache: `{lowballer:boolean, tireKicker:boolean, blacklisted:boolean, blacklistReason:string, sends:number, offers:number, avgOfferPct:number|null, closes:number, computedAt:string}`) and `blacklistedAt DateTime?`, `blacklistReason String?`. Blacklist = still visible under "Show blacklisted", never deleted, excluded from cascade unless toggled.

### 7.2 Logic — `src/lib/buyers/feedback.ts`
- `recomputeBuyerFlags(buyerId)` over all `DealSend`:
  - `sends`, `offers` (outcome ∈ offer|loi|closed), `closes`, `avgOfferPct = avg(offerAmount / floorPrice)` where both exist.
  - **Lowballer**: ≥3 offers AND avgOfferPct < 0.70 → true.
  - **Tire-kicker**: ≥5 sends AND 0 offers AND 0 "pass with reason" → true.
  - Writes `buyerFlags` via `updateBuyer(...)` (history row, action `flags_recompute`).
- Hook: every DealSend create/update → recompute that buyer.
- Scorecard (`scorecard.ts`): add 2 chips — `🎯 hit rate 3/12` and `⚠️ lowballer (avg 61%)` / `💤 tire-kicker` / `⛔ blacklisted`. Tier rule: lowballer or tire-kicker → cap at **B**; blacklisted → **C** and greyed.
- Cascade (`buyer-match.ts` or the new matcher): lowballer −20, tire-kicker −15, blacklisted → excluded (shown in a collapsed "excluded" list with reason).

### 7.3 UI
- On each deal (Deals page): **"Sends"** panel — one row per DealSend: buyer · wave · sent · outcome dropdown · offer $ · pass reason · note. Logging an outcome is 2 clicks.
- `cascade.ts` (ping-tree) writes a `DealSend` per email it sends; the existing claim/pass links set `outcome` (interested → `offer`/`loi` pending amount; pass → `pass`).
- Buyer card drawer: **Track record** tab — sends / offers / avg % / closes, last 5 sends with outcomes, flag chips, **Blacklist** toggle with reason (owner/manager only) and **Un-blacklist**.
- Weekly digest (reuse the Sunday report sender): top 10 responsive buyers · 10 gone dark · lowballers added this week · counties where every send got a pass.

---

## Phase 8 — Packet auto-builder (the bottleneck)

Goal: enter APNs (or pick a deal) → ~60 s → draft offering packet PDF matching `warroom-vetted-buyers-build/samples/port-charlotte-packet.pdf` (Jon's template: cover · Offering Summary & Terms · Site & Due Diligence Summary · Attached Documentation index · Tab A parcel maps · Tab B FEMA · Tab C NWI wetlands · Tab D soils). Fields we can't get from an API are rendered as **🟡 TO BE VERIFIED** pills (county utilities, setbacks, scrub-jay for non-FL layers, electric).

### 8.1 Data sources (all public REST unless noted)
| Item | Call | Notes |
|---|---|---|
| Parcel polygon, acreage, zoning, situs, owner (redact) | **Regrid API** `GET https://app.regrid.com/api/v2/parcels/apn?parcelnumb=<APN>&path=/us/<st>/<county>&token=REGRID_API_KEY` → GeoJSON | Jon has Regrid; if key tier lacks API, fall back to county GIS ArcGIS parcel layer by APN (make `lib/geo/parcels.ts` pluggable per county). |
| FEMA flood zone, BFE, panel, effective date | **NFHL** `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?geometry=<lng>,<lat>&geometryType=esriGeometryPoint&inSR=4326&outFields=FLD_ZONE,ZONE_SUBTY,STATIC_BFE,SFHA_TF,DFIRM_ID,FIRM_PAN&returnGeometry=false&f=json` ; panel date: layer 3 (FIRM Panels) `EFF_DATE` | Use parcel centroid + also test polygon intersects (layer 28 with `geometryType=esriGeometryPolygon`) so "part of lot in AE" is caught. |
| FEMA map image (Tab B) | NFHL export: `.../NFHL/MapServer/export?bbox=<minx,miny,maxx,maxy>&bboxSR=4326&layers=show:28,3&size=1400,1000&format=png&transparent=true&f=image` over a satellite basemap, parcel outlined red | Official FIRMette PDF: optional Playwright step against msc.fema.gov; if it fails, the export image + layer attributes are the tab. Label as "NFHL export" not "FIRMette". |
| Wetlands (NWI) classes + % of parcel | **USFWS NWI** `https://fwsprimary.wim.usgs.gov/server/rest/services/Wetlands/MapServer/0/query?geometry=<polygon json>&geometryType=esriGeometryPolygon&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=ATTRIBUTE,WETLAND_TYPE&returnGeometry=true&f=geojson` | % wetlands = turf.intersect area / parcel area. Tab C image = same export pattern over basemap. |
| Soils (Tab D) | **USDA Soil Data Access** `POST https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest` with `{query:"SELECT ... FROM mapunit ... WHERE mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('<WKT polygon>'))", format:"JSON"}` → map unit name, % of AOI, drainage class, hydric rating, flooding freq | Build the same "Oldsmar sand–Urban land 72%" table the sample shows. |
| Satellite + parcel outline (cover + Tab A) | **Google Static Maps** `https://maps.googleapis.com/maps/api/staticmap?size=1200x800&scale=2&maptype=hybrid&path=color:0xff0000ff|weight:4|fillcolor:0x00000000|<lat,lng|...>&key=GOOGLE_MAPS_API_KEY` (or Mapbox Static with GeoJSON overlay) | Zoom to fit parcel + ~3 lots of context; add street labels (hybrid). |
| FL scrub-jay / listed species | FWC/USFWS ArcGIS layers (FL only); other states: skip → 🟡 | Keep a per-state registry `lib/geo/species.ts`. |
| Elevation / slope | USGS 3DEP `https://epqs.nationalmap.gov/v1/json?x=<lng>&y=<lat>&units=Feet` on 5 sample points → min/max/slope % | Cheap, useful for "flat" claim. |
| Utilities, setbacks, electric | none | render 🟡 TO BE VERIFIED with county phone from `lib/geo/counties.ts` (seed FL/TN/TX/AZ/CA counties we work). |

All calls go through `lib/geo/fetchCached.ts` (GeoCache-style table `DiligenceCache` keyed by source+APN+polygon hash, TTL 90 d) so re-generating a packet is free and we never hammer public endpoints. Respect Nominatim/USGS rate limits (1 rps).

### 8.2 Pipeline — `lib/packet/build.ts`
1. Input: `dealId` + list of APNs (or addresses → Regrid by address). Deal fields (`contractPrice` hidden — no asking price in packet), `deal-land.ts` fields override API values when set by a human.
2. For each parcel: Regrid → centroid/polygon → FEMA / NWI / SDA / 3DEP / species in parallel (Promise.allSettled; any failure = 🟡 for that item, never a crash).
3. Assemble `PacketModel` (TypeScript type in `lib/packet/types.ts`) — one object with all tabs' data + image URLs/buffers.
4. Render HTML from `lib/packet/template.tsx` (server component → string) styled to match the sample: navy cover, gold rules, 4 stat tiles, parcel schedule table, diligence rows with status pills, doc index, tab pages with maps and captions ("Parcel geometry per Regrid; not survey-verified").
5. HTML → PDF with `@sparticuz/chromium` + `puppeteer-core` (Vercel-safe) or `playwright` locally. Merge into one PDF; store in Supabase Storage bucket `packets/` as `<dealId>/<yyyy-mm-dd>-v<n>.pdf` (**never overwrite; new version each run**), save URL on a new `DealPacket` row `{dealId, version, url, model Json, generatedBy, createdAt, approvedAt?, approvedBy?}`.
6. Return to UI with a **diff vs previous version** (which fields changed).

### 8.3 UI — Deals page → "📦 Packet" tab
- APN input (multi), **Generate draft** → progress steps (Regrid ✓ · FEMA ✓ · Wetlands ✓ · Soils ✓ · Maps ✓ · PDF ✓).
- Preview (iframe) + checklist of 🟡 items with inline inputs (water/sewer/electric/setbacks/species) → **Regenerate**.
- **Approve** (locks that version; this is the one the cascade sends). **Download** · **Copy link** · **Open in Drive** (upload approved PDF to Drive folder `War Room Backups / Packets / <deal>` using the Phase 1 service account).
- Also expose `POST /api/packet/generate` (CRON_SECRET or session) so GHL / Direct REI webhooks can trigger it.

### 8.4 Tests
- Fixture: the 7 Port Charlotte APNs in the sample (402116252014, 402116252015, 402116401007, 402116177010, 402116177011, 402116177012, 402116177026). Expected: all AE/BFE 9 (panel 12015C0202G/0201G, eff 12/15/2022); NWI hits on the two Seward St lots (PSS1/EM1Cd + PEM1Ad); soils dominated by Oldsmar sand–Urban land. Snapshot the rendered PacketModel (minus timestamps) and assert.

---

## Phase 9 — Under-contract → auto-cascade → send queue

- Trigger points (any one): Deal `status` → `under_contract` (server action), `POST /api/webhooks/deal` (CRON_SECRET or HMAC) for GoHighLevel / Direct REI, or manual **Arm** button.
- On trigger: (1) if no approved `DealPacket` → create a **draft** packet via Phase 8 and open a task "Packet needs approval" (Slack/Google Chat via `notify.ts`); (2) run the new geocoded matcher (BUILD_SPEC Phase 3 — build it now if not done: `lib/buybox/match.ts` from `reference/score.ts`, replacing text matching) → persist ranking on the deal; (3) build the **send queue**: wave 1 = tier-1 A/B buyers not blacklisted, wave 2 = tier-1 C + tier-2 near-miss, wave 3 = long shots.
- **Human gate:** nothing sends until a dispo clicks **Send wave 1** on the deal (shows the ranked list with fit chips, the approved packet, and the drafted email/SMS per buyer — editable). After send, `cascade.ts` ping-tree takes over for subsequent waves (reuse its claim/pass links, now writing `DealSend`).
- SMS channel via existing Twilio/Telnyx integration if present (`notify.ts`); else email only.
- Each send/open/click/reply → `DealSend` + `BuyerTouch` automatically. No manual "reached out" lines.
- Deal page shows a **cascade timeline**: wave · buyers · sent · opened · replied · offer, with the next-wave countdown.

---

## Phase 10 — Interview ↔ buy box sync + developer magic link

- `DevInterviews.tsx` save → also writes the structured `buyBoxStruct` (map interview fields: buyCounties→geo.counties, buyCities→geo.cities, buyStates→geo.states, targetZips→geo.zips, landTypes→asset.types (mapper), lotMin/lotMax→size.acres_min/max, priceMin/Max/pricePerLot→price, closeSpeed→terms.close_days, dealBreakers→asset.exclusions) with `buyBoxSource: "interview"`; never downgrade a `manual` box without a diff prompt.
- **Magic link:** `BuyerPortalToken {id, buyerId, token(unique, 32 bytes), createdAt, lastUsedAt, revokedAt?}`. Route `/b/[token]`: no login; shows the buyer's own buy box in plain language + an edit form (same fields as the interview) + "Send us a deal" contact line. Saves via `setBuyBox(..., "web_form", actor="portal:<buyer>")` with history; notifies dispo ("Goodall updated their buy box: acres_min 15→20").
- Buyer card: **🔗 Copy their link** · **Revoke**. Intake-by-phone unchanged: Sharyn fills the interview, the link just lets them keep it current.

---

## Phase 11 — Verify
- Build + vitest green. Zero deletes (grep). Backup pill green.
- Packet fixture snapshot passes; generate the Port Charlotte packet end-to-end and compare visually with the sample PDF (screenshot pages 1–4 to `/qa/`).
- Fire the webhook with a test deal → draft packet + ranked queue appear; nothing is sent until "Send wave 1".
- Log 3 lowball offers on a test buyer → card shows ⚠️ lowballer, tier capped at B, cascade score drops. Blacklist → excluded from queue, still visible under "Show blacklisted". Restore works.
- Magic link: edit a field as the buyer → history row, dispo notification, cascade re-ranks.
- Update `CHANGELOG_vetted_buyers.md`.

## Env vars to add
`REGRID_API_KEY` · `GOOGLE_MAPS_API_KEY` (static maps + geocoding) · `TWILIO_*` if SMS · (already) `CRON_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `ANTHROPIC_API_KEY`.
