// Structured Buy Box — schema v1 (source of truth: warroom-vetted-buyers-build/
// buybox/schema.md). Every field optional; null/[] = unknown — never guess.
// Stored on MarketContact.buyBoxStruct (Json). Prose stays in notes.

export type AssetType =
  | "raw_land" | "finished_lots" | "entitled_land" | "teardown" | "sfr"
  | "multifamily" | "commercial" | "mixed_use" | "industrial" | "hospitality"
  | "ag_land" | "condo_townhome";

export type BuyBox = {
  buyer_id: string;
  geo: {
    states: string[];      // ["TN","KY"] USPS codes
    counties: string[];    // ["Rutherford, TN"] "County, ST"
    cities: string[];      // ["Murfreesboro, TN"]
    zips: string[];
    regions: string[];     // named metros mapped to county sets via REGIONS
    radius: { center: string; lat: number; lng: number; miles: number } | null;
    nationwide: boolean;
    exclusions: string[];
    neighborhood_notes: string;
  };
  asset: { types: AssetType[]; exclusions: string[] };
  size: {
    acres_min: number | null;
    acres_max: number | null;
    lots_min: number | null;
    lot_width_ft: number[];
    lot_sqft_min: number | null;
  };
  price: {
    min: number | null;
    max: number | null;
    unit: "total" | "per_lot" | "per_acre" | "per_sqft" | "arv" | null;
    // Schema says number, but the 9/22 backfill contains the odd prose string —
    // consumers must typeof-guard.
    discount_to_market_pct: number | string | null;
    notes: string;
  };
  terms: {
    funding: "cash" | "hard_money" | "conventional" | "mixed" | null;
    close_days: number | null;
    proof_of_funds: boolean | null;
  };
  status: {
    buying_now: boolean | null;
    volume_note: string;
    submission_requirements: string[];
    best_contact: string;
  };
  confidence: "high" | "medium" | "low";
  source: "backfill_2026-09-22" | "interview" | "web_form" | "manual" | "ai_intake";
};

/** A safe empty box to spread partial data onto (never guess = all unknown). */
export function emptyBuyBox(buyerId: string, source: BuyBox["source"]): BuyBox {
  return {
    buyer_id: buyerId,
    geo: { states: [], counties: [], cities: [], zips: [], regions: [], radius: null, nationwide: false, exclusions: [], neighborhood_notes: "" },
    asset: { types: [], exclusions: [] },
    size: { acres_min: null, acres_max: null, lots_min: null, lot_width_ft: [], lot_sqft_min: null },
    price: { min: null, max: null, unit: null, discount_to_market_pct: null, notes: "" },
    terms: { funding: null, close_days: null, proof_of_funds: null },
    status: { buying_now: null, volume_note: "", submission_requirements: [], best_contact: "" },
    confidence: "low",
    source,
  };
}
