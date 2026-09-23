# War Room — Vetted Buyers rebuild (BUILD_SPEC v1)

**For:** Claude Code, running inside the War Room repo (Next.js App Router + Prisma + Postgres on Supabase, deployed on Vercel).
**Owner:** Jon (Freedom Offers). Read this whole file, then execute phases in order. After each phase: run `npm run build`, commit with the phase name, and print a 5-line summary.

---

## 0. Non-negotiable rules (read twice)

1. **NEVER DELETE BUYER DATA.** No `prisma.buyer.delete`, no `deleteMany`, no `DROP`, no `TRUNCATE`, no destructive migration on any buyer-related table. Only *archive* (`archivedAt` timestamp). If you find an existing delete path (the 🗑 button on the buyers table, a server action, an API route), **replace it with Archive**. Grep the repo for `.delete(` / `deleteMany` / `DELETE FROM` on buyer tables and report every hit before changing anything.
2. **Every change to a buyer is recorded** in `BuyerHistory` (before/after JSON). Nothing is overwritten silently.
3. **Backup before touching data.** Phase 1 ends with a working export + a Drive upload. Do not run Phase 3 (data load) until a backup file exists in Drive.
4. **Additive migrations only.** New columns/tables. Existing columns stay. If you must rename, add the new column, copy, keep the old one.
5. **Do not touch automations** (Direct REI hooks, web form → buyer, Slack alerts). That's a later phase Jon will approve separately.
6. When unsure, stop and ask Jon — don't guess on anything that writes to the DB.

---

## 1. Orientation (read-only, ~10 min)

Find and report (paths + a one-line description each):

- The Prisma schema and the buyer model (has fields like `name, phone, phone2, email, links, notes, buyingArea/area, buyBox…, status, lastTouch`, ids are cuid + some `mc_*` legacy ids).
- The `/marketing` page (Vetted Buyers) and its child components: cascade, demand board, interviews list, map + list, area-map upload grid, target markets, buyers-going-cold, master table.
- The server actions behind the table cells (autosave), "Log touch", status change, and the 🗑 button.
- The current cascade ranking function (it does a text match on the buying-area string — that's the bug).
- Where area-map images are stored (Supabase Storage bucket `buybox-maps`, public URLs) and the DB field that holds the URL.
- Any existing cron / `vercel.json` / API routes.
- Env vars present in `.env` **names only** (never print values).

Print the report, then continue.

---

## 2. Phase 1 — Safety: archive-only + history + backup

### 2.1 Prisma (additive)

```prisma
model Buyer {
  // ...existing fields untouched...
  archivedAt     DateTime?
  archivedBy     String?
  archiveReason  String?
  buyBox         Json?       // structured buy box, see buybox/schema.md
  buyBoxUpdatedAt DateTime?
  buyBoxSource   String?     // "backfill_2026-09-22" | "interview" | "web_form" | "manual" | "ai_intake"
  geoPolygon     Json?       // GeoJSON Feature|FeatureCollection (buyer's drawn buy-box area)
  geoCentroidLat Float?
  geoCentroidLng Float?
  history        BuyerHistory[]
  contacts       BuyerContact[]
  touches        BuyerTouch[]
}

model BuyerHistory {
  id        String   @id @default(cuid())
  buyerId   String
  buyer     Buyer    @relation(fields: [buyerId], references: [id])
  at        DateTime @default(now())
  actor     String?  // user email/name if available, else "system"
  action    String   // "update" | "archive" | "restore" | "buybox_update" | "polygon_update" | "import"
  field     String?  // for single-field updates
  before    Json?
  after     Json?
  @@index([buyerId, at])
}

model BuyerContact {          // multiple people per company (Bloomfield has 3)
  id       String  @id @default(cuid())
  buyerId  String
  buyer    Buyer   @relation(fields: [buyerId], references: [id])
  name     String
  role     String?
  phone    String?
  email    String?
  isPrimary Boolean @default(false)
  archivedAt DateTime?
}

model BuyerTouch {            // replaces free-text "2026-08-14: reached out" lines going forward
  id       String   @id @default(cuid())
  buyerId  String
  buyer    Buyer    @relation(fields: [buyerId], references: [id])
  at       DateTime @default(now())
  channel  String?  // call | email | text | linkedin | form
  outcome  String?  // no_answer | spoke | vm | replied | meeting
  note     String?
  actor    String?
}
```

Run `prisma migrate dev --name buyers_archive_history_buybox`. Verify with `prisma migrate status`.

### 2.2 Write path guard

- Create `lib/buyers/write.ts` with `updateBuyer(id, patch, actor)`, `archiveBuyer(id, reason, actor)`, `restoreBuyer(id, actor)`, `setBuyBox(id, buyBox, source, actor)`, `setPolygon(id, geojson, actor)`. **Every** function writes a `BuyerHistory` row in the same transaction.
- Route all existing server actions (cell autosave, status change, log touch, upload map) through these helpers.
- Replace the 🗑 button with **Archive** (confirm dialog: "Archive, not delete — restorable any time"). Add a **Show archived (N)** toggle to the table and a **Restore** button on archived rows.
- Add `prisma` middleware (or a `$extends` query hook) that throws on `delete`/`deleteMany` for `Buyer`, `BuyerHistory`, `BuyerContact`, `BuyerTouch`. Belt and braces.
- All list queries default to `where: { archivedAt: null }`.

### 2.3 Backup + Google Drive sync

- `app/api/backup/route.ts` (GET, protected by `CRON_SECRET` header or an admin session):
  1. Query **all** buyers (archived included) with history, contacts, touches, buyBox, polygon, area-map URL.
  2. Build `vetted_buyers_<ISO date>.json` and `.csv`.
  3. Download each area-map image from Supabase Storage and add to a zip `area_maps_<date>.zip`.
  4. Upload JSON + CSV + zip to Google Drive folder **`War Room Backups / Vetted Buyers`** (folder id `18d9kIHwiQHTp54dZcUU53UqczBotrgUB`) using a service account (`GOOGLE_SERVICE_ACCOUNT_JSON` env; Jon must share that Drive folder with the service-account email — tell him the email after you create it, and stop until he confirms). Fallback if no service account yet: write the files to a Supabase Storage bucket `backups/` so nothing is lost, and log a warning.
  5. Keep the last 90 daily snapshots; older ones are moved to a `_archive` subfolder (never deleted).
- `vercel.json` cron: `{"path":"/api/backup","schedule":"0 9 * * *"}` (09:00 UTC = 2 am PT nightly).
- Header button on Vetted Buyers: **⬇ Backup now** → calls the route, shows toast with the Drive link + counts ("60 buyers · 28 maps · 1,204 history rows").
- Sidebar status pill: "Last backup: 2h ago ✓" (red if > 36 h).

**Gate:** run `/api/backup` once manually. Confirm a file exists in Drive (or the fallback bucket) before continuing.

---

## 3. Phase 2 — Structured buy box (data model + backfill load)

- Read `buybox/schema.md` (TypeScript type + scoring table). Put the type in `lib/buybox/types.ts`. Put `REGIONS` (region → counties) in `lib/buybox/regions.ts` (copy from `buybox/regions.json`).
- Script `scripts/load-buybox-backfill.ts`: reads `buybox/buybox_backfill_2026-09-22.json`, matches on `buyer_id` (falls back to exact `name`), and calls `setBuyBox(id, buyBox, "backfill_2026-09-22", "claude-backfill")`. Prints matched/unmatched. **Do not overwrite** a buyBox whose `buyBoxSource` is `manual` or `interview`.
- Run it. Expect 60 matched, 0 unmatched.
- Geocode centroids: for each buyer with no polygon, compute `geoCentroidLat/Lng` from the first city (or county seat, or radius center) via the geocoder in Phase 3 and store it. Cache results in a `GeoCache` table (address → lat/lng/county/city/zip/state) so we never pay twice.

---

## 4. Phase 3 — Geocoded cascade (THE feature)

### 4.1 Geocoder
- `lib/geo/geocode.ts` → `geocode(input): Promise<{lat,lng,formatted,county,city,state,zip} | null>`.
- Provider: Google Geocoding if `GOOGLE_MAPS_API_KEY` exists, else Mapbox if `MAPBOX_TOKEN`, else **Nominatim** (free, add `User-Agent`, 1 req/s). Extract county from `administrative_area_level_2` (Google) / `context` (Mapbox) / `address.county` (Nominatim). Normalize county as `"Rutherford, TN"` (strip "County").
- Always write to `GeoCache`; read from it first.
- Accept partial inputs too: "Murfreesboro, TN", "Rutherford County TN", "37129".

### 4.2 Matcher + scorer
- `lib/buybox/match.ts` → `rankBuyers(deal: {lat,lng,county,city,state,zip, price?, acres?, assetType?}, buyers) => RankedBuyer[]`.
- Implement exactly the table in `buybox/schema.md` § Cascade scoring. Geo gate order: polygon contains point (use `@turf/boolean-point-in-polygon`) → radius (`@turf/distance`) → zip → city → county → region (expand via REGIONS) → state → nationwide. Near-miss: within 25 mi of any polygon edge / radius edge / city centroid (use buyer centroid if nothing else).
- Return `{buyer, score, tier: 1|2|3, why: Chip[]}` where `Chip = {ok: boolean|"warn", label: string}`.
- Unit tests (`vitest`) with the fixture in `buybox/test-cases.json`. **All must pass.** The Murfreesboro case must return ≥ 5 tier-1 buyers including Goodall, Legacy South, M/I Homes, Ole South, Ryan Homes; Dream Finders / Darryl Carey (Dalamar) / PG Taylor / Drees in tier 1 or 2.

### 4.3 Cascade UI (replaces the current cascade box)
- One search bar at the top of the page: **address / area / ZIP** + optional **price**, **acres**, **asset type** (select: land, teardown, SFR, MF, commercial).
- On submit: geocode → show a "deal pin" on the map → rank → render **ranked cards**:
  - Rank badge, buyer name, company, **fit score ring** (0–100), tier label (`Send first` / `Near miss — worth a call` / `Long shot`).
  - Chips: `✅ Rutherford Co.` `✅ $ in range` `⚠️ 12 ac < 15 ac min` `⚡ cash · <14d` `❌ buying paused` `🧊 90d no touch`.
  - Primary contact (phone · email), one-click **📇 Log touch**, **✉ Draft email** (opens mailto with a template that includes the address), **📋 Copy** row.
  - Bulk: **Copy top N as list**, **Export ranked CSV**.
- Empty/near-miss state must say *why* nobody matched ("No buyer covers Maury Co. — nearest: Goodall (18 mi)").
- Persist the last 20 searches in `CascadeSearch` table (address, geocode result, top 10 ids, at, actor) — useful later for the demand board.

---

## 5. Phase 4 — Table + drawer + paste-to-fill

- Replace the 10-column table with **compact rows**: name · type icon · primary county/region · asset-type chips (max 3 + "+n") · price band · status pill · last touch (relative, red if > 30 d) · fit-score placeholder column (shows score when a cascade search is active).
- Click row → **slide-out drawer** (right, 560 px) with tabs:
  1. **Buy Box** — structured form bound to `buyBox` (geo lists as tag inputs with autocomplete from GeoCache/REGIONS; numeric fields; asset-type multiselect; terms; buying-now toggle). Save → `setBuyBox(..., "manual")`.
  2. **Notes** — the legacy notes blob shown read-only at the bottom; new entries go to `BuyerTouch` as a timestamped log (newest first). "Log touch" writes here.
  3. **Contacts** — `BuyerContact` list, add/edit, mark primary. Migration script: parse existing `email` (split on `|`, `/`, spaces) and `phone/phone2` into contacts on first open (keep originals).
  4. **Files** — area-map image (existing) + any attachments; link to Drive backup of this buyer.
  5. **History** — `BuyerHistory` timeline (who/when/what), read-only.
- **Paste-to-fill**: textarea "Paste call notes / transcript" → server action calls the Anthropic API (`ANTHROPIC_API_KEY`) with the schema from `buybox/schema.md` + `buybox/extract-prompt.md` → returns a BuyBox JSON → shows a **diff** vs current (added/changed fields highlighted) → user clicks **Apply** → `setBuyBox(..., "ai_intake")` + a `BuyerTouch` with the raw paste as note. Never auto-apply.
- **Add buyer** button in the header (name + one contact is enough to create; everything else in the drawer).
- Filters/search stay (name/email/notes/type/status) + add **county/region** and **asset type** filters.

---

## 6. Phase 5 — Map polygons + page restructure

- Fix map: `map.fitBounds` to all buyer centroids on load; cluster pins; buyer pin click → drawer.
- Add **Leaflet.draw** (or `react-leaflet-draw`): "Draw buy-box area" on a buyer → polygon saved as GeoJSON via `setPolygon`. Multiple polygons allowed (FeatureCollection). Colored by market. Existing area-map images stay as attachments in the Files tab; the 60-row upload grid is removed from the page.
- Cascade results render on the same map (deal pin + highlighted matching polygons).
- Remove from `/marketing`: interview list (keep the data; show a "Buy box completeness x/10" bar in the drawer instead), Target Markets block, Markets & research block → move both to a new route `/markets` (link in sidebar). Demand board now reads `buyBox.geo.counties/cities` across active buyers (count per county) and renders immediately — keep the "Pull seller leads" button.
- Keep **Buyers going cold** (sort by fit to recent searches if any, else by days); add Log touch inline.
- Header KPI strip: vetted buyers · counties covered · cold count · backup status.

---

## 7. Phase 6 — Verify (must pass before you tell Jon it's done)

- `npm run build` clean; `vitest` green.
- Grep: zero `delete(`/`deleteMany` on buyer tables; prisma guard throws in a test.
- Cascade manual tests (`buybox/test-cases.json`) — run each through the UI and screenshot the results (save to `/qa/`).
- Archive a test buyer → it disappears from lists, appears under "Show archived", Restore brings it back, history shows both events.
- `/api/backup` → files present in Drive (or fallback bucket) with today's date; "Last backup" pill green.
- Page height: `/marketing` scroll height reduced by ≥ 60 % vs before (measure with `document.body.scrollHeight`).
- Write `CHANGELOG_vetted_buyers.md` summarizing what changed + how to roll back (git revert; migrations are additive so no data loss).

---

## 8. Files in this package

| Path | What |
|---|---|
| `buybox/schema.md` | BuyBox TypeScript type + scoring table (source of truth) |
| `buybox/regions.json` | Region → counties map |
| `buybox/buybox_backfill_2026-09-22.json` | Structured buy boxes for all 60 buyers (parsed from their notes) |
| `buybox/backfill_review.csv` | Same, one row per buyer, for Jon's eyeball check |
| `buybox/test-cases.json` | Cascade test fixtures + expected buyers |
| `buybox/extract-prompt.md` | Prompt for paste-to-fill extraction |
| `reference/score.ts` | Reference implementation of the scorer (adapt, don't blindly paste) |
| `reference/geocode.ts` | Reference geocoder with provider fallback + cache shape |
| `backup/vetted_buyers_2026-09-22.json` | Raw snapshot of the live page at spec time (already in Drive too) |
