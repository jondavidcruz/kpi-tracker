// Vetting scorecard + buyer tier + county coverage — pure functions, no DB.
// Section 3 of the Vetted Buyers upgrade (2026-10-01). Everything is DERIVED
// from data we already store (CRM fields, structured buy box, land interview,
// terms, touches). Nothing here writes.
import type { BuyBox } from "@/lib/buybox/types";
import type { BuyerLand } from "@/lib/buyer-land";
import { regionCounties } from "@/lib/buybox/regions";

export type ScoreCheck = { key: string; label: string; ok: boolean; detail: string };
export type Tier = "A" | "B" | "C";
export type TouchLite = { at: string; channel?: string | null; outcome?: string | null; note?: string | null };

export type ScorecardInput = {
  id: string;
  name: string;
  company?: string;
  type?: string;
  category?: string;
  market?: string;
  region?: string;
  buyBoxAreas?: string;
  dealType?: string;
  buildType?: string;
  priceRange?: string;
  minLotSize?: string;
  closingSpeed?: string;
  decisionMaker?: string;
  bestContact?: string;
  preferredContact?: string;
  lastContacted?: string; // YYYY-MM-DD
  outreachLog?: string;
  phone?: string;
  email?: string;
  igHandle?: string;
  contact?: string;        // legacy: area-map image URL
  buyBoxStruct?: BuyBox | null;
  geoPolygon?: unknown;
  land?: BuyerLand;
  terms?: { pof?: boolean; maxOfferPct?: number };
  touches?: TouchLite[];
};

export type Scorecard = {
  id: string;
  name: string;
  checks: ScoreCheck[];
  score: number;          // 0–10
  pct: number;            // 0–100
  tier: Tier;
  tierWhy: string;
  paused: boolean;        // buying_now === false
  responsive: boolean;
  daysSinceTouch: number | null;
  lastTouches: TouchLite[]; // newest first, max 3
  counties: string[];     // every county this buyer covers (regions expanded)
  cities: string[];
  states: string[];
  nationwide: boolean;
  chips: string[];        // 3–4 one-glance facts for the card
};

const has = (s?: string | null) => !!(s && String(s).trim());
const num = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Parse "2026-08-14: reached out" style lines out of the legacy outreach log. */
export function touchesFromLog(log?: string): TouchLite[] {
  if (!log) return [];
  const out: TouchLite[] = [];
  for (const line of log.split(/\n/)) {
    const m = line.match(/^\s*(\d{4}-\d{2}-\d{2})\s*[:\-–]?\s*(.*)$/);
    if (m) out.push({ at: m[1], note: m[2].trim() || "reached out" });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

function daysBetween(today: string, ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(ymd)) return null;
  const ms = Date.parse(today) - Date.parse(ymd.slice(0, 10));
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
}

function splitList(s?: string): string[] {
  return (s ?? "").split(/[\n;,]+/).map((x) => x.trim()).filter(Boolean);
}

/** Normalize "Davidson County, TN" / "Davidson, TN" / "Davidson Co." → "Davidson, TN" when possible. */
export function normCounty(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  s = s.replace(/\s*(county|co\.?|parish)\s*,/i, ",").replace(/\s*(county|co\.?|parish)$/i, "");
  const m = s.match(/^(.+?),\s*([A-Za-z]{2})$/);
  return m ? `${m[1].trim()}, ${m[2].toUpperCase()}` : s;
}

export function buildScorecard(b: ScorecardInput, today: string): Scorecard {
  const bb = b.buyBoxStruct ?? null;
  const l = b.land ?? {};
  const t = b.terms ?? {};

  // ── geo coverage ──
  const counties = new Set<string>();
  const cities = new Set<string>();
  const states = new Set<string>();
  bb?.geo?.counties?.forEach((c) => counties.add(normCounty(c)));
  bb?.geo?.regions?.forEach((r) => regionCounties(r).forEach((c) => counties.add(normCounty(c))));
  bb?.geo?.cities?.forEach((c) => cities.add(c.trim()));
  bb?.geo?.states?.forEach((s) => states.add(s.toUpperCase()));
  splitList(l.buyCounties).forEach((c) => counties.add(normCounty(c)));
  splitList(l.buyCities).forEach((c) => cities.add(c));
  splitList(l.buyStates).forEach((s) => s.length === 2 && states.add(s.toUpperCase()));
  const nationwide = !!bb?.geo?.nationwide;
  const hasArea = counties.size > 0 || cities.size > 0 || !!bb?.geo?.radius || !!b.geoPolygon || nationwide || has(b.buyBoxAreas) || has(l.targetZips) || states.size > 0;

  // ── the 10 checks ──
  const assetTypes = bb?.asset?.types ?? [];
  const hasTypes = assetTypes.length > 0 || has(b.dealType) || has(b.buildType) || has(l.landTypes);
  const priceKnown = num(bb?.price?.min) || num(bb?.price?.max) || has(b.priceRange) || num(l.priceMin) || num(l.priceMax) || num(l.pricePerLot);
  const sizeKnown = num(bb?.size?.acres_min) || num(bb?.size?.acres_max) || num(bb?.size?.lots_min) || num(bb?.size?.lot_sqft_min) || has(b.minLotSize) || num(l.lotMin) || num(l.lotMax);
  const fundingRaw = (bb?.terms?.funding ?? "") || (/cash/i.test(b.closingSpeed ?? "") || /cash/i.test(l.closeSpeed ?? "") ? "cash" : "");
  const fundingKnown = has(fundingRaw);
  const closeDays = num(bb?.terms?.close_days) ? bb!.terms.close_days! : /14/.test(b.closingSpeed ?? "") || /14/.test(l.closeSpeed ?? "") ? 14 : /15.?30/.test(b.closingSpeed ?? "") || /15.?30/.test(l.closeSpeed ?? "") ? 30 : /30.?(45|60)/.test(b.closingSpeed ?? "") || /30.?60/.test(l.closeSpeed ?? "") ? 60 : null;
  const closeKnown = closeDays !== null || has(b.closingSpeed) || has(l.closeSpeed);
  const pof = !!t.pof || bb?.terms?.proof_of_funds === true;
  const decisionMaker = has(b.decisionMaker) && !/not direct/i.test(b.decisionMaker ?? "") ? b.decisionMaker! : has(bb?.status?.best_contact) ? bb!.status.best_contact : "";
  const dmKnown = has(decisionMaker);
  const buyingNow = bb?.status?.buying_now ?? null;
  const activeKnown = buyingNow !== null;
  const paused = buyingNow === false;

  // touches: DB touches first, else parse the legacy log; newest first
  const dbTouches = (b.touches ?? []).map((x) => ({ ...x, at: String(x.at).slice(0, 10) }));
  const logTouches = touchesFromLog(b.outreachLog);
  const merged = [...dbTouches, ...logTouches].sort((a, c) => (a.at < c.at ? 1 : -1));
  const lastTouches = merged.slice(0, 3);
  const lastAt = merged[0]?.at ?? (has(b.lastContacted) ? b.lastContacted! : "");
  const daysSinceTouch = lastAt ? daysBetween(today, lastAt) : null;
  const lastOutcome = (dbTouches[0]?.outcome ?? "").toLowerCase();
  const responsive = (daysSinceTouch !== null && daysSinceTouch <= 30) || /replied|spoke|meeting/.test(lastOutcome) || /replied|spoke|talked|connected|provided/i.test(merged[0]?.note ?? "");

  const checks: ScoreCheck[] = [
    { key: "area", label: "Area", ok: hasArea, detail: counties.size ? `${counties.size} counties` : cities.size ? `${cities.size} cities` : nationwide ? "nationwide" : hasArea ? "text only" : "unknown" },
    { key: "types", label: "Asset types", ok: hasTypes, detail: assetTypes.length ? assetTypes.join(", ") : b.dealType || l.landTypes || "unknown" },
    { key: "price", label: "Price", ok: !!priceKnown, detail: priceLabel(bb, b.priceRange, l) },
    { key: "size", label: "Acreage", ok: !!sizeKnown, detail: sizeLabel(bb, b.minLotSize, l) },
    { key: "funding", label: "Funding", ok: fundingKnown, detail: fundingRaw || "unknown" },
    { key: "close", label: "Close speed", ok: closeKnown, detail: closeDays !== null ? `≤${closeDays}d` : b.closingSpeed || l.closeSpeed || "unknown" },
    { key: "pof", label: "POF", ok: pof, detail: pof ? "verified" : "not on file" },
    { key: "dm", label: "Decision-maker", ok: dmKnown, detail: decisionMaker || "need acq contact" },
    { key: "active", label: "Buying now", ok: activeKnown && !paused, detail: paused ? "paused — still send" : activeKnown ? "confirmed" : "unconfirmed" },
    { key: "responsive", label: "Responsive", ok: responsive, detail: daysSinceTouch === null ? "never touched" : `${daysSinceTouch}d ago` },
  ];
  const score = checks.filter((c) => c.ok).length;

  // ── tier ──
  const cashOrPof = /cash/i.test(fundingRaw) || pof;
  let tier: Tier; let tierWhy: string;
  if (score >= 8 && cashOrPof && !paused && responsive) { tier = "A"; tierWhy = "complete box · cash/POF · active · responsive"; }
  else if (score >= 5 && !paused) { tier = "B"; tierWhy = `${score}/10 · ${cashOrPof ? "cash/POF" : "funding ?"} · ${responsive ? "responsive" : "quiet"}`; }
  else { tier = "C"; tierWhy = paused ? "buying paused" : `${score}/10 — fill the box`; }

  const chips: string[] = [];
  if (counties.size) chips.push(`📍 ${firstN([...counties], 2).join(" · ")}${counties.size > 2 ? ` +${counties.size - 2}` : ""}`);
  else if (cities.size) chips.push(`📍 ${firstN([...cities], 2).join(" · ")}`);
  else if (nationwide) chips.push("🌎 nationwide");
  else if (has(b.market)) chips.push(`📍 ${b.market}`);
  if (priceKnown) chips.push(`💰 ${priceLabel(bb, b.priceRange, l)}`);
  if (sizeKnown) chips.push(`📐 ${sizeLabel(bb, b.minLotSize, l)}`);
  if (/cash/i.test(fundingRaw)) chips.push(`⚡ cash${closeDays ? ` · ≤${closeDays}d` : ""}`);
  else if (closeDays) chips.push(`⏱ ≤${closeDays}d`);
  if (paused) chips.push("⏸ paused");

  return {
    id: b.id, name: b.name, checks, score, pct: score * 10, tier, tierWhy, paused, responsive, daysSinceTouch, lastTouches,
    counties: [...counties].sort(), cities: [...cities].sort(), states: [...states].sort(), nationwide, chips,
  };
}

const firstN = <T,>(a: T[], n: number) => a.slice(0, n);
const money = (n: number) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${n}`);
function priceLabel(bb: BuyBox | null, priceRange?: string, l?: BuyerLand): string {
  const mn = bb?.price?.min, mx = bb?.price?.max, unit = bb?.price?.unit;
  const u = unit === "per_lot" ? "/lot" : unit === "per_acre" ? "/ac" : unit === "arv" ? " ARV" : "";
  if (num(mn) && num(mx)) return `${money(mn)}–${money(mx)}${u}`;
  if (num(mx)) return `≤${money(mx)}${u}`;
  if (num(mn)) return `${money(mn)}+${u}`;
  if (l && num(l.priceMin) && num(l.priceMax)) return `${money(l.priceMin)}–${money(l.priceMax)}`;
  if (l && num(l.pricePerLot)) return `${money(l.pricePerLot)}/lot`;
  if (has(priceRange)) return priceRange!.slice(0, 28);
  return "unknown";
}
function sizeLabel(bb: BuyBox | null, minLot?: string, l?: BuyerLand): string {
  const a = bb?.size?.acres_min, z = bb?.size?.acres_max, lots = bb?.size?.lots_min, sq = bb?.size?.lot_sqft_min;
  if (num(a) && num(z)) return `${a}–${z} ac`;
  if (num(a)) return `${a}+ ac`;
  if (num(z)) return `≤${z} ac`;
  if (num(lots)) return `${lots}+ lots`;
  if (num(sq)) return `${sq.toLocaleString()} sf min`;
  if (l && (num(l.lotMin) || num(l.lotMax))) return `${l.lotMin ?? "?"}–${l.lotMax ?? "?"} ac`;
  if (has(minLot)) return minLot!.slice(0, 24);
  return "unknown";
}

/** County coverage: for each county, who covers it and at what tier. Sorted by A-count then total. */
export type CoverageRow = { county: string; state: string; a: number; b: number; c: number; total: number; buyers: { id: string; name: string; tier: Tier }[] };
export function coverageByCounty(cards: Scorecard[]): CoverageRow[] {
  const map = new Map<string, CoverageRow>();
  for (const c of cards) {
    for (const county of c.counties) {
      const st = county.split(",").pop()?.trim().toUpperCase() ?? "";
      const row = map.get(county) ?? { county, state: st, a: 0, b: 0, c: 0, total: 0, buyers: [] };
      row[c.tier.toLowerCase() as "a" | "b" | "c"] += 1; row.total += 1;
      row.buyers.push({ id: c.id, name: c.name, tier: c.tier });
      map.set(county, row);
    }
  }
  return [...map.values()].sort((x, y) => y.a - x.a || y.total - x.total || x.county.localeCompare(y.county));
}
