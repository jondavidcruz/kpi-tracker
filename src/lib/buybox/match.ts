// Cascade matcher + scorer — Phase 3 of the vetted-buyers rebuild.
// Implements EXACTLY the scoring table in warroom-vetted-buyers-build/buybox/
// schema.md § Cascade scoring (adapted from reference/score.ts). Pure functions,
// no DB, no network — the caller geocodes the deal and loads the buyers.
//
// Hard geo gate first (a buyer must cover the deal's location to rank at all),
// then soft points for price / acreage / asset type / terms / status / touch
// recency. Every factor that fired is returned as a chip so the rep sees WHY.
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { REGIONS } from "./regions";
import type { BuyBox } from "./types";

export type Chip = { ok: boolean | "warn"; label: string };

export type Deal = {
  lat: number;
  lng: number;
  county?: string; // "Rutherford, TN"
  city?: string; // "Murfreesboro, TN"
  state?: string; // "TN"
  zip?: string; // "37129"
  price?: number;
  acres?: number;
  assetType?: string;
};

export type BuyerLite = {
  id: string;
  name: string;
  buyBox: Partial<BuyBox> | null;
  geoPolygon?: Feature | FeatureCollection | null;
  geoCentroidLat?: number | null;
  geoCentroidLng?: number | null;
  lastTouchAt?: Date | string | null;
  archivedAt?: Date | string | null;
  // Phase 7 feedback loop
  flags?: { lowballer?: boolean; tireKicker?: boolean } | null;
  blacklistedAt?: Date | string | null;
};

export type Ranked = {
  buyer: BuyerLite;
  score: number; // 0–100
  tier: 1 | 2 | 3; // 1 = match, 2 = near-miss, 3 = long shot
  why: Chip[];
  geoBasis: string;
  nearMiles?: number;
};

const NEAR_MISS_MI = 25;
const eqi = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const miles = (a: [number, number], b: [number, number]) => distance(point(a), point(b), { units: "miles" });

type GeoVerdict = { pts: number; basis: string; chip?: Chip; nearMiles?: number };

function geoGate(deal: Deal, b: BuyerLite): GeoVerdict {
  const g: Partial<BuyBox["geo"]> = b.buyBox?.geo ?? {};
  const pt = point([deal.lng, deal.lat]);

  // Explicit exclusions kill the match outright ("everything but Austin").
  if (deal.city && (g.exclusions ?? []).some((e) => eqi(e, deal.city!) || eqi(e, deal.city!.split(",")[0]))) {
    return { pts: -999, basis: "excluded", chip: { ok: false, label: `❌ excludes ${deal.city.split(",")[0]}` } };
  }

  // 1. Drawn polygon (strongest signal)
  if (b.geoPolygon) {
    const fc = b.geoPolygon as FeatureCollection;
    const feats: Feature[] = fc.type === "FeatureCollection" ? fc.features : [b.geoPolygon as Feature];
    try {
      if (feats.some((f) => booleanPointInPolygon(pt, f as Feature<Polygon | MultiPolygon>))) {
        return { pts: 100, basis: "polygon", chip: { ok: true, label: "📍 inside drawn buy-box area" } };
      }
    } catch { /* malformed geometry → fall through to the list-based gates */ }
  }
  // 2. Radius
  if (g.radius?.lat != null && g.radius?.lng != null && g.radius?.miles) {
    const d = miles([deal.lng, deal.lat], [g.radius.lng, g.radius.lat]);
    if (d <= g.radius.miles) return { pts: 100, basis: "radius", chip: { ok: true, label: `✅ ${Math.round(d)} mi from ${g.radius.center} (≤${g.radius.miles})` } };
  }
  // 3. zip → city → county → region → state → nationwide
  if (deal.zip && (g.zips ?? []).includes(deal.zip)) return { pts: 100, basis: "zip", chip: { ok: true, label: `✅ ZIP ${deal.zip}` } };
  if (deal.city && (g.cities ?? []).some((c) => eqi(c, deal.city!))) return { pts: 90, basis: "city", chip: { ok: true, label: `✅ ${deal.city.split(",")[0]}` } };
  if (deal.county && (g.counties ?? []).some((c) => eqi(c, deal.county!))) return { pts: 80, basis: "county", chip: { ok: true, label: `✅ ${deal.county.split(",")[0]} Co.` } };
  if (deal.county) {
    const region = (g.regions ?? []).find((r) => REGIONS[r]?.some((c) => eqi(c, deal.county!)) || regionLookup(r).some((c) => eqi(c, deal.county!)));
    if (region) return { pts: 70, basis: "region", chip: { ok: true, label: `✅ ${region}` } };
  }
  if (deal.state && (g.states ?? []).includes(deal.state) && !(g.counties ?? []).length && !(g.cities ?? []).length && !(g.regions ?? []).length) {
    return { pts: 50, basis: "state", chip: { ok: true, label: `✅ statewide ${deal.state}` } };
  }
  if (g.nationwide) return { pts: 30, basis: "nationwide", chip: { ok: "warn", label: "🌎 nationwide buyer" } };

  // Near-miss: within 25 mi of the buyer's centroid (stand-in for polygon/radius/city edges)
  if (b.geoCentroidLat != null && b.geoCentroidLng != null) {
    const d = miles([deal.lng, deal.lat], [b.geoCentroidLng, b.geoCentroidLat]);
    if (d <= NEAR_MISS_MI) return { pts: 40, basis: "near", nearMiles: d, chip: { ok: "warn", label: `⚠️ ${Math.round(d)} mi outside buy box` } };
  }
  // Same state but a different listed area → long shot, still shown
  if (deal.state && (g.states ?? []).includes(deal.state)) return { pts: 20, basis: "state-longshot", chip: { ok: "warn", label: "⚠️ same state, different area" } };
  return { pts: -999, basis: "none" };
}

// Case-insensitive region lookup (REGIONS keys are proper-cased).
function regionLookup(name: string): string[] {
  const key = Object.keys(REGIONS).find((k) => eqi(k, name));
  return key ? REGIONS[key] : [];
}

function between(v: number, min?: number | null, max?: number | null): "in" | "near" | "below" | "above" {
  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  if (v >= lo && v <= hi) return "in";
  const tol = 0.2;
  if (v >= lo * (1 - tol) && v <= hi * (1 + tol)) return "near";
  return v < lo ? "below" : "above";
}
const fmt$ = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`);

/** Rank every non-archived buyer against a geocoded deal. Sorted tier-then-score. */
export function rankBuyers(deal: Deal, buyers: BuyerLite[]): Ranked[] {
  const out: Ranked[] = [];
  for (const b of buyers) {
    if (b.archivedAt) continue;
    if (b.blacklistedAt) continue; // excluded — callers list these separately with the reason
    const bb: Partial<BuyBox> = b.buyBox ?? {};
    let hardSizeMiss = false; // acreage far below the buyer's min → near-miss, not match
    const geo = geoGate(deal, b);
    if (geo.pts <= -999) continue;
    let score = geo.pts;
    const why: Chip[] = geo.chip ? [geo.chip] : [];
    // A radius/polygon/zip hit outranks the county gate, but the county is still
    // the chip reps recognize — show it whenever it also matches.
    if (geo.basis !== "county" && deal.county && ((bb.geo?.counties ?? []) as string[]).some((c) => eqi(c, deal.county!))) {
      why.push({ ok: true, label: `✅ ${deal.county.split(",")[0]} Co.` });
    }

    // Price (only when the box prices in deal-total dollars)
    if (deal.price != null && (bb.price?.min != null || bb.price?.max != null) && (bb.price?.unit ?? "total") === "total") {
      let r = between(deal.price, bb.price?.min, bb.price?.max);
      // Below their MIN but within 20% = still a fit: a buyer's min is appetite,
      // their max is ability (spec fixture: $900k vs Ryan's $1M min = in range).
      if (r === "near" && bb.price?.min != null && deal.price < bb.price.min) r = "in";
      if (r === "in") { score += 25; why.push({ ok: true, label: "✅ $ in range" }); }
      else if (r === "near") { score += 10; why.push({ ok: "warn", label: "⚠️ $ slightly outside" }); }
      else { score -= 15; why.push({ ok: false, label: `❌ ${fmt$(deal.price)} ${r} range` }); }
    }
    // Acreage
    if (deal.acres != null && (bb.size?.acres_min != null || bb.size?.acres_max != null)) {
      const r = between(deal.acres, bb.size?.acres_min, bb.size?.acres_max);
      if (r === "in") { score += 25; why.push({ ok: true, label: `✅ ${deal.acres} ac fits` }); }
      else if (r === "near") { score += 10; why.push({ ok: "warn", label: `⚠️ ${deal.acres} ac near limit` }); }
      else if (r === "below") { score -= 25; hardSizeMiss = true; why.push({ ok: false, label: `⚠️ ${deal.acres} ac < ${bb.size?.acres_min} ac min` }); }
      else { score -= 15; why.push({ ok: false, label: `⚠️ ${deal.acres} ac > ${bb.size?.acres_max} ac max` }); }
    } else if (deal.acres != null && bb.size?.lots_min && deal.acres < 10) {
      score -= 20; why.push({ ok: "warn", label: `⚠️ wants ${bb.size.lots_min}+ lots` });
    }
    // Asset type
    if (deal.assetType) {
      const plain = deal.assetType.replace(/_/g, " ");
      if ((bb.asset?.exclusions ?? []).some((e) => e.toLowerCase().includes(plain))) {
        score -= 40; why.push({ ok: false, label: `❌ excludes ${plain}` });
      } else if ((bb.asset?.types ?? []).includes(deal.assetType as never)) {
        score += 15; why.push({ ok: true, label: `✅ buys ${plain}` });
      }
    }
    // Terms
    if (bb.terms?.close_days != null && bb.terms.close_days <= 30) { score += 10; why.push({ ok: true, label: `⚡ closes ≤${bb.terms.close_days}d` }); }
    else if (bb.terms?.close_days != null && bb.terms.close_days <= 90) score += 5;
    if (bb.terms?.funding === "cash") { score += 5; why.push({ ok: true, label: "💵 cash" }); }
    // Buying now
    if (bb.status?.buying_now === true) score += 10;
    if (bb.status?.buying_now === false) { score -= 10; why.push({ ok: "warn", label: "❌ buying paused — still send" }); }
    // Phase 7 track record (spec: lowballer −20, tire-kicker −15)
    if (b.flags?.lowballer) { score -= 20; why.push({ ok: "warn", label: "⚠️ lowballer history" }); }
    if (b.flags?.tireKicker) { score -= 15; why.push({ ok: "warn", label: "💤 tire-kicker — never bids" }); }
    // Relationship recency
    if (b.lastTouchAt) {
      const days = (Date.now() - new Date(b.lastTouchAt).getTime()) / 864e5;
      if (days <= 30) score += 5;
      else if (days > 90) { score -= 5; why.push({ ok: "warn", label: `🧊 ${Math.round(days)}d since touch` }); }
    }

    let tier: 1 | 2 | 3 = geo.basis === "near" || geo.basis === "state-longshot" ? 2 : geo.basis === "nationwide" ? 3 : 1;
    // A hard acreage miss demotes "send first" → "worth a call" — but only for
    // buyers with a SPECIFIC area (county/region or tighter). A statewide buyer's
    // box is deliberately loose, so the size miss just lowers the score (spec
    // fixtures: Waterstone 60<100 ac in DFW demotes; Tutt statewide FL doesn't).
    if (tier === 1 && hardSizeMiss && geo.pts >= 70) tier = 2;
    out.push({ buyer: b, score: Math.max(0, Math.min(100, Math.round(score * 0.66))), tier, why, geoBasis: geo.basis, nearMiles: geo.nearMiles });
  }
  return out.sort((a, b) => a.tier - b.tier || b.score - a.score);
}

/** The "why nobody matched" line for the empty state: nearest buyer by centroid. */
export function nearestMiss(deal: Deal, buyers: BuyerLite[]): { name: string; miles: number } | null {
  let best: { name: string; miles: number } | null = null;
  for (const b of buyers) {
    if (b.archivedAt || b.geoCentroidLat == null || b.geoCentroidLng == null) continue;
    const d = miles([deal.lng, deal.lat], [b.geoCentroidLng, b.geoCentroidLat]);
    if (!best || d < best.miles) best = { name: b.name, miles: Math.round(d) };
  }
  return best;
}
