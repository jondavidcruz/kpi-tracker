import { getCurrentUser, isManager, canAccessMarketing } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import { readTargetMarkets, readMarketPulls, coverageFor } from "@/lib/target-markets";
import MarketsBoard, { type MarketView } from "@/components/MarketsBoard";
import ResearchWorkbench from "@/components/ResearchWorkbench";
import MarketFinder from "@/components/MarketFinder";
import MarketsTabs from "@/components/MarketsTabs";
import MarketBlacklist from "@/components/MarketBlacklist";
import { readBlacklist } from "@/lib/market-blacklist";
import { readScan, scoreCounties } from "@/lib/market-scan";
import { SCAN_SEED } from "@/lib/market-scan-seed";
import { COUNTY_CENTROIDS } from "@/lib/county-centroids";

export const dynamic = "force-dynamic";

// 🗺 Target Markets — where we hunt land, coverage (what we've pulled), performance, and the
// owner's 30-60-180 trend read. Seeded from Viktoriia's FL wealth/business research.
export default async function MarketsPage() {
  const me = await getCurrentUser();
  if (!me || !canAccessMarketing(me)) {
    return <Card className="mx-auto max-w-md p-8 text-center text-slate-500">Target Markets is for the acquisitions &amp; leadership team.</Card>;
  }
  const leader = isManager(me);
  const [markets, pulls, opps, buyers, scan] = await Promise.all([
    readTargetMarkets(),
    readMarketPulls(),
    // Land-lead opps, for per-market performance (fuzzy address match). Light select.
    db.crmOpportunity.findMany({ where: { archivedAt: null }, select: { title: true, stage: true, value: true, createdAt: true, contact: { select: { address: true } } }, take: 6000 }).catch(() => []),
    // Vetted/active buyers' buy-boxes, for "where can we move deals" coverage (light text select).
    db.marketContact.findMany({ where: { archivedAt: null, blacklistedAt: null, vetStage: { in: ["vetted", "active"] } }, select: { buyBoxAreas: true, market: true } }).catch(() => []),
    readScan().catch(() => null),
  ]);
  const buyerHay = buyers.map((b) => `${b.buyBoxAreas ?? ""} ${b.market ?? ""}`.toLowerCase());

  // 📍 Buyer buy-box coverage points — CACHE-ONLY read (no external calls on render). Places
  // are geocoded in the background via POST /api/markets/geocode (manager button on the map).
  const { readGeocache, placesFromBuyBoxes, pointsFor, normalizePlace } = await import("@/lib/geocode");
  const geocache = await readGeocache();
  const buyerPlaces = placesFromBuyBoxes(buyers);
  const buyerPoints = pointsFor(buyerPlaces, geocache);
  const geocodeRemaining = buyerPlaces.filter((p) => !(normalizePlace(p) in geocache)).length;
  // 📍 Lead pins — where our seller leads come from + where we've closed land deals.
  const { buildLeadPins } = await import("@/lib/lead-pins");
  const { pins: leadPins, uncachedZips: leadZipsRemaining } = buildLeadPins(opps, geocache);

  // 🖍 Hand-drawn / searched territories (areas we market in / have pulled vs uncharted).
  const { readTerritories } = await import("@/lib/map-territories");
  const territories = await readTerritories();
  const blacklist = await readBlacklist();

  const now = Date.now(), DAY = 86_400_000;
  // Build a lowercase address haystack + created-age per opp once.
  const oppHay = opps.map((o) => ({
    hay: `${o.title ?? ""} ${o.contact?.address ?? ""}`.toLowerCase(),
    won: /won|closed|signed|sold/i.test(o.stage) && !/dead|died|lost|nurtur/i.test(o.stage),
    ageDays: (now - o.createdAt.getTime()) / DAY,
  }));

  // 📊 Lead/deal count INSIDE each marked area — free text match of the CRM lead's ZIP / city
  // to the territory name (searched ZIP/county/city areas; freehand draws with no place name
  // just won't match). Turns the map into a performance tool: which painted areas produce.
  const STOP = new Set(["county", "florida", "united", "states", "area", "city", "town", "the", "and"]);
  const terrStats: Record<string, { leads: number; deals: number }> = {};
  for (const t of territories) {
    const zip = (t.name.match(/\b\d{5}\b/) || [])[0];
    const toks = zip ? [zip] : t.name.toLowerCase().split(/[,\s]+/).map((w) => w.trim()).filter((w) => w.length >= 4 && !STOP.has(w));
    let leads = 0, deals = 0;
    if (toks.length) for (const o of oppHay) { if (toks.some((tk) => o.hay.includes(tk))) { leads++; if (o.won) deals++; } }
    terrStats[t.id] = { leads, deals };
  }

  const views: MarketView[] = markets.map((m) => {
    // Match tokens: city names in the market name + enclaves + region (≥4 chars to avoid noise).
    const toks = [...m.name.split(/[/,&]/), ...m.enclaves, m.region]
      .map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 4);
    let leads = 0, deals = 0, d30 = 0, d60 = 0, d180 = 0;
    for (const o of oppHay) {
      if (!toks.some((t) => o.hay.includes(t))) continue;
      leads++; if (o.won) deals++;
      if (o.ageDays <= 180) { d180++; if (o.ageDays <= 60) { d60++; if (o.ageDays <= 30) d30++; } }
    }
    // 📊 Auto-momentum (30-60-180, free — our own pipeline, no DealMachine/RentCast): compare
    // the last-30-day lead pace to the average 30-day pace over the prior 150 days.
    let trend: "up" | "flat" | "down" | "" = "";
    if (d180 >= 3) {
      const priorPer30 = (d180 - d30) / 5;
      trend = d30 >= priorPer30 * 1.4 && d30 >= 1 ? "up" : d30 <= priorPer30 * 0.6 ? "down" : "flat";
    }
    // 🟢 Buyer coverage — how many vetted buyers can take a deal here ("charted" vs uncharted).
    const buyerCount = buyerHay.filter((h) => toks.some((t) => h.includes(t))).length;
    return { m, coverage: coverageFor(m.id, pulls), leads, deals, momentum: { d30, d60, d180, trend }, buyerCount };
  });

  // Quick-select counties for the DealMachine panel (click a market → county pre-selected + its
  // recommended buy-box applied, no typing). Preset = the market's primary land focus.
  const { MARKET_COUNTY_FIPS } = await import("@/lib/dealmachine");
  const focusPreset: Record<string, string> = { infill_luxury: "infill", acreage: "acreage", commercial: "commercial" };
  const quickMarkets = Object.entries(MARKET_COUNTY_FIPS).map(([name, fips]) => {
    const m = markets.find((x) => x.name === name);
    const preset = m?.landFocus?.length ? (focusPreset[m.landFocus[0]] ?? "absentee") : "absentee";
    return { name, fips, preset };
  });
  // County FIPS → our target-market id, so the buyer-demand engine can read pull coverage for
  // markets we already track (a county NOT in here is a brand-new market = discovery).
  const targetFipsToId: Record<string, string> = {};
  for (const [name, fips] of Object.entries(MARKET_COUNTY_FIPS)) {
    const m = markets.find((x) => x.name === name);
    if (m) targetFipsToId[fips] = m.id;
  }

  // 🔎 Market Finder — the live scan from the DB, or the precomputed seed (scored on the fly)
  // until someone runs the first refresh. Shallow-copy the seed rows so scoring never mutates
  // the shared import.
  const scanStore = scan ?? { ...SCAN_SEED, counties: scoreCounties(SCAN_SEED.counties.map((c) => ({ ...c }))) };

  // Market Finder points for the map — join each scanned county to its centroid.
  const scanPoints = (scanStore.counties ?? []).flatMap((c) => {
    const ctr = COUNTY_CENTROIDS[c.fips];
    if (!ctr) return [];
    return [{
      fips: c.fips, name: c.name.replace(/ County$/, ""), state: c.state, score: c.score, tier: c.tier,
      price: c.medianSalePrice, yoy: c.yoyPct, dtp: c.daysToPending,
      landShare: c.land ? c.land.highShare : null, lat: ctr[0], lng: ctr[1],
    }];
  });

  // At-a-glance market read for the Research Workbench — keyed by county FIPS so picking a county
  // shows its price tier / land ≥$100k share / YoY / days-to-pending right next to the filters.
  const scanAtAGlance: Record<string, { name: string; state: string; tier: "target" | "watch" | "low"; price: number | null; yoy: number | null; dtp: number | null; landShare: number | null; landHigh: number | null; landTotal: number | null }> = {};
  for (const c of scanStore.counties ?? []) {
    scanAtAGlance[c.fips] = {
      name: c.name, state: c.state, tier: c.tier,
      price: c.medianSalePrice, yoy: c.yoyPct, dtp: c.daysToPending,
      landShare: c.land ? c.land.highShare : null, landHigh: c.land ? c.land.high : null, landTotal: c.land ? c.land.total : null,
    };
  }

  // Pull coverage keyed by county FIPS — only for markets we actually track (target list), so the
  // workbench badge never falsely claims "never pulled" for a county we have no record of.
  const coverageByFips: Record<string, { status: "never" | "clear" | "cooldown"; cooldownLeft: number; lastPull: string | null }> = {};
  for (const [fips, marketId] of Object.entries(targetFipsToId)) {
    const cv = coverageFor(marketId, pulls);
    coverageByFips[fips] = { status: cv.status, cooldownLeft: cv.cooldownLeft, lastPull: cv.lastPull };
  }

  // 🎯 Buyer-demand market discovery — rank WHICH markets to pull by our vetted buyers' aggregated
  // buy-boxes (reverse-engineered from the developers we actually have), biased to NEW markets.
  const demand = await (async () => {
    try {
      const { recommendMarketsByBuyerDemand } = await import("@/lib/buyer-demand-markets");
      return await recommendMarketsByBuyerDemand(scanStore.counties ?? [], pulls, targetFipsToId);
    } catch { return undefined; } // degrade gracefully — the strip just hides
  })();
  // 💪 Buying-power county boundaries — where our vetted buyers want to buy (green on the map).
  const buyerCoverage = demand
    ? await (async () => { try { const { buyerCoverageRings } = await import("@/lib/buyer-coverage-map"); return await buyerCoverageRings(demand.markets.map((m) => ({ fips: m.fips, name: m.name, state: m.state, buyers: m.buyers, newMarket: m.newMarket }))); } catch { return []; } })()
    : [];

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗺 Target Markets"
        subtitle="Where we hunt land — the high-net-worth, waterfront, business-dense Florida & South Carolina markets the wealthy keep building in through rate hikes, and that few wholesalers compete in. Track what we've pulled, how each market performs, and the 30-60-180 trend."
        accent="bg-emerald-400"
      />
      <MarketBlacklist entries={blacklist} canEdit={leader} />
      <MarketsTabs
        showResearch={leader}
        map={<MarketsBoard markets={views} canEdit={leader} buyerPoints={buyerPoints} geocodeRemaining={geocodeRemaining} territories={territories} terrStats={terrStats} scanPoints={scanPoints} leadPins={leadPins} leadZipsRemaining={leadZipsRemaining} buyerCoverage={buyerCoverage} />}
        research={leader ? <ResearchWorkbench quickMarkets={quickMarkets} scan={scanAtAGlance} demand={demand} coverage={coverageByFips} /> : null}
        finder={<MarketFinder initial={scanStore} canRefresh={leader} />}
      />
    </div>
  );
}
