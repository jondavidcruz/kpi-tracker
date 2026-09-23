# Structured Buy Box — schema v1

One `buy_box` object per buyer. Every field optional; `null`/`[]` = unknown (never guess). Prose stays in `notes`; this is the machine-readable layer the cascade matches on.

```ts
type BuyBox = {
  buyer_id: string
  geo: {
    states: string[]            // ["TN","KY"]  USPS codes
    counties: string[]          // ["Rutherford, TN"]  "County, ST"
    cities: string[]            // ["Murfreesboro, TN"]
    zips: string[]              // ["37129"]
    regions: string[]           // named metros/regions we map to county sets: "Nashville MSA","DFW","Coachella Valley","Florida Panhandle","SoCal"
    radius: { center: string, lat: number, lng: number, miles: number } | null
    nationwide: boolean         // Hilbers "all states", Blue Fern "national"
    exclusions: string[]        // ["Austin, TX"]
    neighborhood_notes: string  // "B/B+/A neighborhoods", "inside Loop 1604"
  }
  asset: {
    types: AssetType[]          // raw_land | finished_lots | entitled_land | teardown | sfr | multifamily | commercial | mixed_use | industrial | hospitality | ag_land | condo_townhome
    exclusions: string[]        // ["wetlands","occupied homes","onesie-twosie lots"]
  }
  size: {
    acres_min: number | null
    acres_max: number | null
    lots_min: number | null     // "min 50 lots per property"
    lot_width_ft: number[]      // [40,50,60,70]
    lot_sqft_min: number | null
  }
  price: {
    min: number | null          // USD
    max: number | null
    unit: "total" | "per_lot" | "per_acre" | "per_sqft" | "arv" | null
    discount_to_market_pct: number | null   // Waterstone 30–50 → 40
    notes: string
  }
  terms: {
    funding: "cash" | "hard_money" | "conventional" | "mixed" | null
    close_days: number | null   // 14 = "<14 days"; 540 = DR Horton 12–24 mo
    proof_of_funds: boolean | null
  }
  status: {
    buying_now: boolean | null  // false = "not looking right now but send deals"
    volume_note: string         // "15–20 lots/mo Cape Coral"
    submission_requirements: string[]
    best_contact: string        // who actually answers
  }
  confidence: "high" | "medium" | "low"   // how much was explicitly stated vs inferred
  source: "backfill_2026-09-22" | "interview" | "web_form" | "manual"
}
```

## Cascade scoring (v1)

Hard filter → soft score. A buyer must pass the geo gate to rank; everything else adds/subtracts points and is shown as chips.

| Gate / factor | Rule | Points |
|---|---|---|
| Geo (hard) | address inside polygon OR within radius OR county/city/zip/region match OR state-wide OR nationwide | pass/fail; polygon/radius/zip = 100, city = 90, county = 80, region = 70, state = 50, nationwide = 30 |
| Near-miss | outside geo by ≤ 25 mi of any polygon/radius/city centroid | shown in tier 2, geo = 40 |
| Price | deal price inside [min,max] = +25 · within 20% = +10 · outside = −15 · unknown = 0 | |
| Acreage | inside [acres_min, acres_max] = +25 · within 20% = +10 · below min = −25 · unknown = 0 | |
| Asset type | deal type ∈ types = +15 · in exclusions = −40 | |
| Close speed | close_days ≤ 30 = +10 · ≤ 90 = +5 | |
| Funding | cash = +5 | |
| Buying now | true = +10 · false = −10 (still shown, greyed) | |
| Relationship | last touch ≤ 30 d = +5 · > 90 d = −5 | |

Output per buyer: `score`, `tier` (1 = match, 2 = near-miss, 3 = long shot), `why[]` chips (`✅ Rutherford Co.`, `✅ $ in range`, `⚠️ 12 ac < 15 ac min`, `❌ buying paused`).
