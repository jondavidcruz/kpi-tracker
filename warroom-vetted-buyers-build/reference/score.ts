// Reference implementation — lib/buybox/match.ts
// Depends on: @turf/boolean-point-in-polygon, @turf/distance, @turf/helpers
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import REGIONS from "../buybox/regions.json";

export type Chip = { ok: boolean | "warn"; label: string };
export type Deal = {
  lat: number; lng: number;
  county?: string; city?: string; state?: string; zip?: string; // "Rutherford, TN", "Murfreesboro, TN", "TN", "37129"
  price?: number; acres?: number; assetType?: string;
};
export type BuyerLite = {
  id: string; name: string; buyBox: any; geoPolygon?: any;
  geoCentroidLat?: number | null; geoCentroidLng?: number | null;
  lastTouchAt?: Date | null; archivedAt?: Date | null;
};
export type Ranked = { buyer: BuyerLite; score: number; tier: 1 | 2 | 3; why: Chip[]; geoBasis: string };

const NEAR_MISS_MI = 25;
const miles = (a: [number, number], b: [number, number]) => distance(point(a), point(b), { units: "miles" });

function geoGate(deal: Deal, b: BuyerLite): { pts: number; basis: string; chip?: Chip; nearMiles?: number } {
  const g = b.buyBox?.geo ?? {};
  const pt = point([deal.lng, deal.lat]);
  // 1. polygon
  if (b.geoPolygon) {
    const feats = b.geoPolygon.type === "FeatureCollection" ? b.geoPolygon.features : [b.geoPolygon];
    if (feats.some((f: any) => booleanPointInPolygon(pt, f))) return { pts: 100, basis: "polygon", chip: { ok: true, label: "📍 inside drawn buy-box area" } };
  }
  // 2. radius
  if (g.radius?.lat && g.radius?.lng && g.radius?.miles) {
    const d = miles([deal.lng, deal.lat], [g.radius.lng, g.radius.lat]);
    if (d <= g.radius.miles) return { pts: 100, basis: "radius", chip: { ok: true, label: `✅ ${Math.round(d)} mi from ${g.radius.center} (≤${g.radius.miles})` } };
  }
  // 3. zip / city / county / region / state / nationwide
  if (deal.zip && g.zips?.includes(deal.zip)) return { pts: 100, basis: "zip", chip: { ok: true, label: `✅ ZIP ${deal.zip}` } };
  if (deal.city && g.cities?.some((c: string) => c.toLowerCase() === deal.city!.toLowerCase())) return { pts: 90, basis: "city", chip: { ok: true, label: `✅ ${deal.city.split(",")[0]}` } };
  if (deal.county && g.counties?.some((c: string) => c.toLowerCase() === deal.county!.toLowerCase())) return { pts: 80, basis: "county", chip: { ok: true, label: `✅ ${deal.county.split(",")[0]} Co.` } };
  if (deal.county) {
    const region = (g.regions ?? []).find((r: string) => (REGIONS as any)[r]?.some((c: string) => c.toLowerCase() === deal.county!.toLowerCase()));
    if (region) return { pts: 70, basis: "region", chip: { ok: true, label: `✅ ${region}` } };
  }
  if (deal.state && g.exclusions?.some((e: string) => e.endsWith(deal.state!) && deal.city && e.startsWith(deal.city.split(",")[0]))) return { pts: -999, basis: "excluded", chip: { ok: false, label: `❌ excludes ${deal.city}` } };
  if (deal.state && g.states?.includes(deal.state) && !g.counties?.length && !g.cities?.length && !g.regions?.length) return { pts: 50, basis: "state", chip: { ok: true, label: `✅ statewide ${deal.state}` } };
  if (g.nationwide) return { pts: 30, basis: "nationwide", chip: { ok: "warn", label: "🌎 nationwide buyer" } };
  // near-miss by centroid distance
  if (b.geoCentroidLat && b.geoCentroidLng) {
    const d = miles([deal.lng, deal.lat], [b.geoCentroidLng, b.geoCentroidLat]);
    if (d <= NEAR_MISS_MI) return { pts: 40, basis: "near", nearMiles: d, chip: { ok: "warn", label: `⚠️ ${Math.round(d)} mi outside buy box` } };
  }
  // state-level fallback when buyer lists specific areas in the same state → long shot
  if (deal.state && g.states?.includes(deal.state)) return { pts: 20, basis: "state-longshot", chip: { ok: "warn", label: `⚠️ same state, different area` } };
  return { pts: -999, basis: "none" };
}

function between(v: number, min?: number | null, max?: number | null) {
  const lo = min ?? -Infinity, hi = max ?? Infinity;
  if (v >= lo && v <= hi) return "in";
  const tol = 0.2;
  if (v >= lo * (1 - tol) && v <= hi * (1 + tol)) return "near";
  return v < lo ? "below" : "above";
}
const fmt$ = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`;

export function rankBuyers(deal: Deal, buyers: BuyerLite[]): Ranked[] {
  const out: Ranked[] = [];
  for (const b of buyers) {
    if (b.archivedAt) continue;
    const bb = b.buyBox ?? {};
    const geo = geoGate(deal, b);
    if (geo.pts <= -999) continue;
    let score = geo.pts; const why: Chip[] = geo.chip ? [geo.chip] : [];

    // price
    if (deal.price != null && (bb.price?.min != null || bb.price?.max != null) && (bb.price?.unit ?? "total") === "total") {
      const r = between(deal.price, bb.price.min, bb.price.max);
      if (r === "in") { score += 25; why.push({ ok: true, label: "✅ $ in range" }); }
      else if (r === "near") { score += 10; why.push({ ok: "warn", label: "⚠️ $ slightly outside" }); }
      else { score -= 15; why.push({ ok: false, label: `❌ ${fmt$(deal.price)} ${r} range` }); }
    }
    // acreage
    if (deal.acres != null && (bb.size?.acres_min != null || bb.size?.acres_max != null)) {
      const r = between(deal.acres, bb.size.acres_min, bb.size.acres_max);
      if (r === "in") { score += 25; why.push({ ok: true, label: `✅ ${deal.acres} ac fits` }); }
      else if (r === "near") { score += 10; why.push({ ok: "warn", label: `⚠️ ${deal.acres} ac near limit` }); }
      else if (r === "below") { score -= 25; why.push({ ok: false, label: `⚠️ ${deal.acres} ac < ${bb.size.acres_min} ac min` }); }
      else { score -= 15; why.push({ ok: false, label: `⚠️ ${deal.acres} ac > ${bb.size.acres_max} ac max` }); }
    } else if (deal.acres != null && bb.size?.lots_min && deal.acres < 10) {
      score -= 20; why.push({ ok: "warn", label: `⚠️ wants ${bb.size.lots_min}+ lots` });
    }
    // asset type
    if (deal.assetType) {
      if (bb.asset?.exclusions?.some((e: string) => e.toLowerCase().includes(deal.assetType!.replace("_", " ")))) { score -= 40; why.push({ ok: false, label: `❌ excludes ${deal.assetType}` }); }
      else if (bb.asset?.types?.includes(deal.assetType)) { score += 15; why.push({ ok: true, label: `✅ buys ${deal.assetType.replace("_", " ")}` }); }
    }
    // terms
    if (bb.terms?.close_days != null && bb.terms.close_days <= 30) { score += 10; why.push({ ok: true, label: `⚡ closes ≤${bb.terms.close_days}d` }); }
    else if (bb.terms?.close_days != null && bb.terms.close_days <= 90) score += 5;
    if (bb.terms?.funding === "cash") { score += 5; why.push({ ok: true, label: "💵 cash" }); }
    // buying now
    if (bb.status?.buying_now === true) score += 10;
    if (bb.status?.buying_now === false) { score -= 10; why.push({ ok: "warn", label: "❌ buying paused — still send" }); }
    // relationship
    if (b.lastTouchAt) {
      const days = (Date.now() - new Date(b.lastTouchAt).getTime()) / 864e5;
      if (days <= 30) score += 5; else if (days > 90) { score -= 5; why.push({ ok: "warn", label: `🧊 ${Math.round(days)}d since touch` }); }
    }
    const tier: 1 | 2 | 3 = geo.basis === "near" || geo.basis === "state-longshot" ? 2 : geo.basis === "nationwide" ? 3 : 1;
    out.push({ buyer: b, score: Math.max(0, Math.min(100, Math.round(score * 0.66))), tier, why, geoBasis: geo.basis });
  }
  return out.sort((a, b) => a.tier - b.tier || b.score - a.score);
}
