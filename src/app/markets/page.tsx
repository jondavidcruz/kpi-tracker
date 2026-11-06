import { getCurrentUser, isManager, canAccessMarketing } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import { readTargetMarkets, readMarketPulls, coverageFor } from "@/lib/target-markets";
import MarketsBoard, { type MarketView } from "@/components/MarketsBoard";

export const dynamic = "force-dynamic";

// 🗺 Target Markets — where we hunt land, coverage (what we've pulled), performance, and the
// owner's 30-60-180 trend read. Seeded from Viktoriia's FL wealth/business research.
export default async function MarketsPage() {
  const me = await getCurrentUser();
  if (!me || !canAccessMarketing(me)) {
    return <Card className="mx-auto max-w-md p-8 text-center text-slate-500">Target Markets is for the acquisitions &amp; leadership team.</Card>;
  }
  const leader = isManager(me);
  const [markets, pulls, opps] = await Promise.all([
    readTargetMarkets(),
    readMarketPulls(),
    // Land-lead opps, for per-market performance (fuzzy address match). Light select.
    db.crmOpportunity.findMany({ where: { archivedAt: null }, select: { title: true, stage: true, value: true, createdAt: true, contact: { select: { address: true } } }, take: 6000 }).catch(() => []),
  ]);

  const now = Date.now(), DAY = 86_400_000;
  // Build a lowercase address haystack + created-age per opp once.
  const oppHay = opps.map((o) => ({
    hay: `${o.title ?? ""} ${o.contact?.address ?? ""}`.toLowerCase(),
    won: /won|closed|signed|sold/i.test(o.stage) && !/dead|died|lost|nurtur/i.test(o.stage),
    ageDays: (now - o.createdAt.getTime()) / DAY,
  }));

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
    return { m, coverage: coverageFor(m.id, pulls), leads, deals, momentum: { d30, d60, d180, trend } };
  });

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗺 Target Markets"
        subtitle="Where we hunt land — the high-net-worth, waterfront, business-dense Florida markets the wealthy keep building in through rate hikes, and that few wholesalers compete in. Track what we've pulled, how each market performs, and the 30-60-180 trend."
        accent="bg-emerald-400"
      />
      <MarketsBoard markets={views} canEdit={leader} />
    </div>
  );
}
