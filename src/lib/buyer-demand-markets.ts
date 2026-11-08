// 🎯 Buyer-demand market discovery — reverse-engineer WHICH markets to pull from the aggregated
// buy-boxes of our VETTED buyers/developers. Jon 2026-11-08: "combining our vetted buyers' buy-boxes
// to understand the markets we should pull is the biggest leverage and gold — reverse-engineer the
// vetted developers' buy-box, find those markets, then pull the motivated-owner types. Our main
// thing is to find NEW markets." So: don't pull where public data merely looks cheap — pull where
// our actual cash buyers are hungry, and surface counties we DON'T already track.
//
// Reuses the buy-box parsers from buyer-coverage.ts and the mom&pop/big classifier from
// builder-size.ts. Resolves each buyer's free-text areas to FL/SC county FIPS using the scan's
// own county list (no new data source), aggregates demand → a ready Research Workbench recipe.
import { db } from "@/lib/db";
import { parsePriceCeiling, parseAcreRange, areaTokens } from "@/lib/buyer-coverage";
import { classifyBuilderSize } from "@/lib/builder-size";
import { coverageFor, type MarketPull } from "@/lib/target-markets";
import type { CountyScan } from "@/lib/market-scan";
import type { WorkbenchState } from "@/lib/dm-filter-catalog";

export type RecommendedMarket = {
  fips: string; name: string; state: string;
  buyers: number; momPop: number; bigBuilder: number;
  priceCeil: number | null;            // highest price a wanting-buyer will pay (margin headroom)
  acre: [number, number] | null;       // aggregated acreage appetite
  coverage: "never" | "clear" | "cooldown"; cooldownLeft: number;
  newMarket: boolean;                  // NOT in our target list → a discovery
  scanTier: "target" | "watch" | "low" | null;
  landSharePct: number | null;         // % of land assessing ≥$100k (margin signal)
  homeMedian: number | null;
  score: number;
  reasons: string[];
  buyerNames: string[];                // who wants it (for the drill-down)
  recipe: WorkbenchState;              // one-click load into the workbench
};

export type DemandResult = {
  markets: RecommendedMarket[];
  vettedBuyers: number;
  broadBuyers: number;                 // nationwide / state-only buyers (no county to rank)
  resolvedBuyers: number;              // buyers who mapped to ≥1 county
  unresolvedAreas: string[];           // area tokens we couldn't map to a FL/SC county
};

const STATE_WORDS = new Set([
  "fl", "florida", "sc", "south carolina", "ga", "georgia", "nc", "north carolina",
  "tx", "texas", "al", "alabama", "tn", "tennessee", "ok", "oklahoma", "nationwide", "usa", "us",
]);

const normCounty = (s: string) =>
  s.toLowerCase().replace(/\bcount(y|ies)\b/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

// Aggregated acreage → the lot_size_acres filter; falls back to open when a buyer gave no range.
function acreToNum(acre: [number, number] | null): { min?: number; max?: number } {
  if (!acre) return {};
  const [lo, hi] = acre;
  return { ...(lo > 0 ? { min: lo } : {}), ...(hi < 100 && hi > 0 ? { max: hi } : {}) };
}

type BuyerLite = {
  name: string; areas: string[]; priceMax: number | null; acre: [number, number] | null;
  size: "mompop" | "big"; nationwide: boolean;
};

/** Build the ranked "pull where our buyers are hungry" list from vetted buy-boxes. */
export async function recommendMarketsByBuyerDemand(
  counties: CountyScan[],
  pulls: MarketPull[],
  targetFipsToId: Record<string, string>,  // county FIPS → our target-market id (for coverage); absent ⇒ new market
): Promise<DemandResult> {
  // County name → {fips,state,scan} index, built from the scan's own county list.
  const byName = new Map<string, CountyScan>();
  for (const c of counties) byName.set(normCounty(c.name), c);

  const buyers: BuyerLite[] = [];

  // ── (a) network leads: vetted developers + buyer agents (CRM kanban is source of truth) ──
  try {
    const { resolveNetworkPipelines } = await import("@/lib/dispo-network");
    const net = await resolveNetworkPipelines();
    if (net.all.length) {
      const opps = await db.crmOpportunity.findMany({
        where: { archivedAt: null, pipeline: { in: net.all } },
        select: { formData: true, contact: { select: { name: true } } },
      }).catch(() => []);
      for (const o of opps) {
        const fd = (o.formData ?? {}) as Record<string, Record<string, unknown>> & { __builderSize?: string };
        const dev = fd.dev_buybox ?? {}; const ag = fd.agent_profile ?? {};
        const areaText = `${dev.buyCounties ?? ""} ${ag.areas ?? ""} ${(fd.__import as Record<string, unknown>)?.market ?? ""}`;
        const areas = areaTokens(areaText);
        const priceMax = parsePriceCeiling(String(dev.priceRange ?? ag.priceRange ?? ""));
        const acre = parseAcreRange(String(dev.lotSize ?? ""));
        const hasBox = !!(priceMax || acre || areas.length || dev.landTypes || dev.closeSpeed || dev.volume || ag.buyerTypes);
        if (!hasBox) continue; // unvetted (no buy-box) = not usable demand
        const name = String(dev.brokerage ?? o.contact?.name ?? "").trim();
        const statesCount = new Set(areaTokens(areaText).filter((t) => STATE_WORDS.has(t))).size;
        const nationwide = /nationwide|national|all\s*states|usa/i.test(areaText);
        const size = classifyBuilderSize({ name, override: fd.__builderSize, nationwide, statesCount, volumeText: String(dev.volume ?? ""), extraText: String(dev.landTypes ?? "") });
        buyers.push({ name: name || "Developer", areas, priceMax, acre, size, nationwide });
      }
    }
  } catch { /* network pipelines unavailable — fall through to MarketContact */ }

  // ── (b) MarketContact vetted directory ──
  const mcs = await db.marketContact.findMany({
    where: { vetStage: { in: ["vetted", "active"] } },
    select: { name: true, type: true, priceRange: true, buyBoxAreas: true, market: true, region: true, minLotSize: true, dealType: true },
  }).catch(() => []);
  for (const m of mcs) {
    const areaText = `${m.buyBoxAreas ?? ""} ${m.market ?? ""} ${m.region ?? ""}`;
    const areas = areaTokens(areaText);
    const statesCount = new Set(areas.filter((t) => STATE_WORDS.has(t))).size;
    const nationwide = /nationwide|national|all\s*states/i.test(areaText);
    const size = classifyBuilderSize({ name: m.name ?? "", nationwide, statesCount, extraText: `${m.type ?? ""} ${m.dealType ?? ""}` });
    buyers.push({
      name: (m.name || "Buyer").trim(),
      areas, priceMax: parsePriceCeiling(String(m.priceRange ?? "")), acre: parseAcreRange(String(m.minLotSize ?? "")),
      size, nationwide,
    });
  }

  // ── resolve buyers → counties, aggregate demand ──
  type Agg = { c: CountyScan; buyers: BuyerLite[] };
  const agg = new Map<string, Agg>();
  const unresolved = new Map<string, number>();
  let broad = 0, resolved = 0;

  for (const b of buyers) {
    const hitFips = new Set<string>();
    for (const tok of b.areas) {
      const key = normCounty(tok);
      if (!key || STATE_WORDS.has(key)) continue;
      const c = byName.get(key);
      if (c) hitFips.add(c.fips);
      else unresolved.set(key, (unresolved.get(key) ?? 0) + 1);
    }
    if (hitFips.size === 0) { if (b.nationwide || b.areas.some((t) => STATE_WORDS.has(normCounty(t)))) broad++; continue; }
    resolved++;
    for (const fips of hitFips) {
      const c = counties.find((x) => x.fips === fips)!;
      const a = agg.get(fips) ?? { c, buyers: [] };
      a.buyers.push(b); agg.set(fips, a);
    }
  }

  // ── score + build recipe per county ──
  const markets: RecommendedMarket[] = [];
  for (const { c, buyers: bs } of agg.values()) {
    const momPop = bs.filter((b) => b.size === "mompop").length;
    const bigBuilder = bs.length - momPop;
    const priceCeils = bs.map((b) => b.priceMax).filter((x): x is number => x != null);
    const priceCeil = priceCeils.length ? Math.max(...priceCeils) : null;
    const acres = bs.map((b) => b.acre).filter((x): x is [number, number] => !!x);
    const acre: [number, number] | null = acres.length ? [Math.min(...acres.map((a) => a[0])), Math.max(...acres.map((a) => a[1]))] : null;

    const inTarget = c.fips in targetFipsToId;
    const cov = inTarget ? coverageFor(targetFipsToId[c.fips], pulls) : { status: "never" as const, cooldownLeft: 0 };
    const newMarket = !inTarget;
    const landSharePct = c.land ? Math.round(c.land.highShare * 100) : null;

    // Score — buyer demand first, with a strong NEW-market + never-pulled bias (Jon's main goal),
    // then the margin signal + a nudge for mom & pop (fastest feedback).
    let score = Math.min(50, bs.length * 12);
    const reasons: string[] = [`${bs.length} vetted buyer${bs.length > 1 ? "s" : ""} want this market`];
    if (newMarket) { score += 25; reasons.push("🆕 not in our target list — a NEW market"); }
    if (cov.status === "never") { score += 15; if (!newMarket) reasons.push("🗺 never pulled"); }
    else if (cov.status === "cooldown") { score -= 10; reasons.push(`⏳ on cooldown (${cov.cooldownLeft}d)`); }
    if (landSharePct != null) { score += Math.min(20, landSharePct); if (landSharePct >= 20) reasons.push(`💎 ${landSharePct}% of land ≥$100k`); }
    if (c.tier === "target") { score += 8; reasons.push("🎯 strong market read"); }
    if (momPop > 0) { score += 5; reasons.push(`🏠 ${momPop} mom & pop (work first)`); }
    if (bigBuilder > 0) reasons.push(`🏢 ${bigBuilder} big builder${bigBuilder > 1 ? "s" : ""}`);
    if (priceCeil) reasons.push(`💵 buyers pay up to $${priceCeil.toLocaleString()}`);

    const recipe: WorkbenchState = {
      enums: { property_type: [6] },
      bools: { is_landlocked: true, has_absentee_owners: true },
      nums: { ...(acre ? { lot_size_acres: acreToNum(acre) } : {}) },
    };

    markets.push({
      fips: c.fips, name: c.name, state: c.state,
      buyers: bs.length, momPop, bigBuilder, priceCeil, acre,
      coverage: cov.status, cooldownLeft: cov.cooldownLeft ?? 0,
      newMarket, scanTier: c.tier, landSharePct, homeMedian: c.medianSalePrice,
      score: Math.round(score), reasons,
      buyerNames: [...new Set(bs.map((b) => b.name))].slice(0, 12),
      recipe,
    });
  }

  markets.sort((a, b) => b.score - a.score);
  const unresolvedAreas = [...unresolved.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  return { markets: markets.slice(0, 15), vettedBuyers: buyers.length, broadBuyers: broad, resolvedBuyers: resolved, unresolvedAreas };
}
