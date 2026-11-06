import { getCurrentUser, isManager, canAccessMarketing } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import { readTargetMarkets, readMarketPulls, coverageFor } from "@/lib/target-markets";
import MarketsBoard, { type MarketView } from "@/components/MarketsBoard";
import DealMachineResearch from "@/components/DealMachineResearch";

export const dynamic = "force-dynamic";

// 🗺 Target Markets — where we hunt land, coverage (what we've pulled), performance, and the
// owner's 30-60-180 trend read. Seeded from Viktoriia's FL wealth/business research.
export default async function MarketsPage() {
  const me = await getCurrentUser();
  if (!me || !canAccessMarketing(me)) {
    return <Card className="mx-auto max-w-md p-8 text-center text-slate-500">Target Markets is for the acquisitions &amp; leadership team.</Card>;
  }
  const leader = isManager(me);
  const [markets, pulls, opps, buyers] = await Promise.all([
    readTargetMarkets(),
    readMarketPulls(),
    // Land-lead opps, for per-market performance (fuzzy address match). Light select.
    db.crmOpportunity.findMany({ where: { archivedAt: null }, select: { title: true, stage: true, value: true, createdAt: true, contact: { select: { address: true } } }, take: 6000 }).catch(() => []),
    // Vetted/active buyers' buy-boxes, for "where can we move deals" coverage (light text select).
    db.marketContact.findMany({ where: { archivedAt: null, blacklistedAt: null, vetStage: { in: ["vetted", "active"] } }, select: { buyBoxAreas: true, market: true } }).catch(() => []),
  ]);
  const buyerHay = buyers.map((b) => `${b.buyBoxAreas ?? ""} ${b.market ?? ""}`.toLowerCase());

  // 📍 Buyer buy-box coverage points — CACHE-ONLY read (no external calls on render). Places
  // are geocoded in the background via POST /api/markets/geocode (manager button on the map).
  const { readGeocache, placesFromBuyBoxes, pointsFor, normalizePlace } = await import("@/lib/geocode");
  const geocache = await readGeocache();
  const buyerPlaces = placesFromBuyBoxes(buyers);
  const buyerPoints = pointsFor(buyerPlaces, geocache);
  const geocodeRemaining = buyerPlaces.filter((p) => !(normalizePlace(p) in geocache)).length;

  // 🖍 Hand-drawn / searched territories (areas we market in / have pulled vs uncharted).
  const { readTerritories } = await import("@/lib/map-territories");
  const territories = await readTerritories();

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

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗺 Target Markets"
        subtitle="Where we hunt land — the high-net-worth, waterfront, business-dense Florida markets the wealthy keep building in through rate hikes, and that few wholesalers compete in. Track what we've pulled, how each market performs, and the 30-60-180 trend."
        accent="bg-emerald-400"
      />
      <MarketsBoard markets={views} canEdit={leader} buyerPoints={buyerPoints} geocodeRemaining={geocodeRemaining} territories={territories} terrStats={terrStats} />
      {leader && <DealMachineResearch />}
    </div>
  );
}
