// 📊 Land-market analysis toolkit (Jon 2026-11-05 — he wants real market-analysis strategies:
// Location Quotient, opportunity scoring, demand-vs-coverage gaps). All computed from data we
// already have (Viktoriia's wealth/business research + our buyer coverage, pull coverage,
// lead/deal performance, momentum) — no external calls, no credits. This is the "where do we
// pull next" brain that ranks target markets for off-market land sourcing.
import type { MarketView } from "@/components/MarketsBoard";

export type Lq = { wealth: number; business: number; demand: number; leads: number; deals: number };
export type MarketAnalysis = {
  id: string; name: string;
  opportunity: number;          // 0–100 composite "pull priority" score
  priority: "pull-now" | "strong" | "watch" | "low";
  lq: Lq;                        // Location Quotient vs the portfolio average (1.0 = par)
  demandCoverageGap: boolean;    // buyers want it AND we've never pulled → the sweet spot
  buyerCount: number; leads: number; deals: number;
  reasons: string[];
};

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
/** Location Quotient: a market's share of a metric relative to the average market. >1.2 = a
 *  concentration (hot), <0.8 = under-represented. The classic market-analysis ratio. */
function lq(x: number, avg: number): number { return avg > 0 ? Math.round((x / avg) * 100) / 100 : 0; }

export function analyzeMarkets(views: MarketView[]): MarketAnalysis[] {
  if (!views.length) return [];
  const avgWealth = mean(views.map((v) => v.m.wealth));
  const avgBusiness = mean(views.map((v) => v.m.business));
  const avgDemand = mean(views.map((v) => v.buyerCount));
  const avgLeads = mean(views.map((v) => v.leads));
  const avgDeals = mean(views.map((v) => v.deals));
  const maxDemand = Math.max(1, ...views.map((v) => v.buyerCount));

  const out = views.map((v): MarketAnalysis => {
    const wealthN = v.m.wealth / 5;
    const businessN = v.m.business / 5;
    const demandN = v.buyerCount / maxDemand;
    const gapN = v.coverage.status === "never" ? 1 : v.coverage.status === "clear" ? 0.6 : 0.15;
    // Momentum = our own lead-flow trend when we have it, else fall back to the owner's 30-60-180
    // research read (m.trend) so a genuinely hot market we haven't pulled yet (e.g. the SC set)
    // still scores up instead of sitting neutral (Jon 2026-11-06).
    const momoN = v.momentum.trend === "up" ? 1 : v.momentum.trend === "down" ? 0.2
      : v.m.trend === "up" ? 0.85 : v.m.trend === "down" ? 0.35 : 0.5;
    const waterN = v.m.waterfront ? 1 : 0;
    const opportunity = Math.round(100 * (0.20 * wealthN + 0.08 * businessN + 0.25 * demandN + 0.22 * gapN + 0.15 * momoN + 0.10 * waterN));
    const demandCoverageGap = v.buyerCount > 0 && v.coverage.status === "never";
    const priority: MarketAnalysis["priority"] = demandCoverageGap ? "pull-now" : opportunity >= 65 ? "strong" : opportunity >= 45 ? "watch" : "low";

    const l: Lq = { wealth: lq(v.m.wealth, avgWealth), business: lq(v.m.business, avgBusiness), demand: lq(v.buyerCount, avgDemand), leads: lq(v.leads, avgLeads), deals: lq(v.deals, avgDeals) };
    const reasons: string[] = [];
    if (demandCoverageGap) reasons.push(`🔥 ${v.buyerCount} buyer${v.buyerCount > 1 ? "s" : ""} want deals here & we've NEVER pulled — pull first`);
    if (l.demand >= 1.3) reasons.push(`🟢 buyer demand ${l.demand}× the average (LQ ${l.demand})`);
    if (l.wealth >= 1.1) reasons.push(`💰 wealth LQ ${l.wealth}`);
    if (v.momentum.trend === "up") reasons.push("📈 our lead flow is accelerating here");
    else if (v.m.trend === "up") reasons.push("📈 market trending up (growth research)");
    if (v.coverage.status === "never") reasons.push("🗺 untapped — never pulled");
    else if (v.coverage.status === "cooldown") reasons.push(`⏳ on pull cooldown (${v.coverage.cooldownLeft}d)`);
    if (v.m.waterfront) reasons.push("🌊 waterfront wealth (builds through rate hikes)");
    if (l.deals >= 1.3) reasons.push(`🏆 deal production ${l.deals}× average`);
    return { id: v.m.id, name: v.m.name, opportunity, priority, lq: l, demandCoverageGap, buyerCount: v.buyerCount, leads: v.leads, deals: v.deals, reasons };
  });
  return out.sort((a, b) => (a.priority === "pull-now" && b.priority !== "pull-now" ? -1 : b.priority === "pull-now" && a.priority !== "pull-now" ? 1 : b.opportunity - a.opportunity));
}
