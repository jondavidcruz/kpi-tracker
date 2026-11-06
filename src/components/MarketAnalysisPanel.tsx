"use client";
// 📊 Market analysis view — Location Quotient + opportunity scoring + the demand-vs-coverage
// gap, ranking target markets for where to source off-market land next. Plus a playbook of the
// market-analysis strategies the team can apply.
import { useState } from "react";
import { analyzeMarkets, type MarketAnalysis } from "@/lib/market-analysis";
import type { MarketView } from "@/components/MarketsBoard";

const PRIO: Record<MarketAnalysis["priority"], { label: string; cls: string }> = {
  "pull-now": { label: "🔥 PULL NOW", cls: "bg-red-100 text-red-700 ring-red-200" },
  strong: { label: "💪 Strong", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
  watch: { label: "👀 Watch", cls: "bg-amber-100 text-amber-800 ring-amber-200" },
  low: { label: "Low", cls: "bg-slate-100 text-slate-500 ring-slate-200" },
};
function lqCls(n: number): string { return n >= 1.2 ? "text-emerald-700" : n <= 0.8 ? "text-slate-400" : "text-slate-600"; }

const PLAYBOOK: { name: string; what: string; use: string }[] = [
  { name: "Location Quotient (LQ)", what: "A market's share of a metric ÷ the average market's share. LQ > 1.2 = a concentration (hot); < 0.8 = under-represented.", use: "Find markets over-concentrated in buyer demand, wealth, or deal production relative to our portfolio — that's where to lean in." },
  { name: "Opportunity score", what: "Weighted blend of wealth, business, buyer demand, coverage gap, momentum, and waterfront into one 0–100 'pull priority'.", use: "Rank where to pull next in one number instead of eyeballing six columns." },
  { name: "Demand–coverage gap", what: "Markets where vetted buyers want deals AND we've never pulled leads.", use: "The #1 sweet spot — guaranteed buyers waiting, zero sourcing done. Pull these first." },
  { name: "Absentee / out-of-state owners", what: "Owners who live elsewhere have no emotional tie to the dirt and answer cold mail.", use: "Filter DealMachine pulls to out-of-state / absentee land owners for the highest response." },
  { name: "Tax-delinquent", what: "Owners behind on taxes are the most motivated to sell cheap, fast.", use: "A 'hot list' split-test against the main pull — expect higher conversion." },
  { name: "Income / population discrepancy", what: "A high-income metro next to a low-income rural county = buy cheap there, sell to metro money. That gap IS the spread.", use: "Target rural counties 1–3 hrs from our wealthy metros (Naples↔inland, Jax↔rural NE FL)." },
  { name: "Days-on-market & months of supply", what: "How fast land sells and how much is listed. Low DOM + tight supply = a seller's market.", use: "Pull where land moves fast (our exit is easy) — feed from DealMachine MLS fields / Redfin data." },
  { name: "Sell-through ratio", what: "Sold ÷ listed per county — closer to 1:1 = liquid.", use: "Prioritize liquid counties so our dispo exit isn't a bottleneck." },
  { name: "Highest & Best Use", what: "Land is valued at its best LEGAL use, not its current use (zoning-permissible → physically possible → financially feasible → maximally productive).", use: "An infill weed-lot surrounded by new builds is worth builder money — target those." },
  { name: "30-60-180 trend", what: "Is lead flow / price accelerating over rolling windows?", use: "Double down where momentum is rising; rotate out of cooling markets (John's cadence)." },
  { name: "Waterfront / oceanfront premium", what: "Wealthy buyers keep building on the water through rate hikes — rate-insensitive demand.", use: "Weight waterfront markets up; they hold value when inland cools." },
];

export default function MarketAnalysisPanel({ markets }: { markets: MarketView[] }) {
  const rows = analyzeMarkets(markets);
  const [showPlay, setShowPlay] = useState(false);
  const pullNow = rows.filter((r) => r.priority === "pull-now").length;
  // 📡 Live DealMachine land inventory (free counts) keyed by market name → supply dimension.
  const [inv, setInv] = useState<Record<string, { parcels: number; owners: number }>>({});
  const [invBusy, setInvBusy] = useState(false);
  const [invMsg, setInvMsg] = useState("");
  async function loadInventory() {
    setInvBusy(true); setInvMsg("Counting off-market land in every market… (free)");
    try {
      const r = await fetch("/api/markets/dm?action=inventory");
      const j = await r.json();
      if (!j.ok) { setInvMsg(`⚠️ ${j.error || "inventory failed"}${/key/i.test(j.error || "") ? " — add DEALMACHINE_V2_KEY in Vercel" : ""}`); return; }
      const m: Record<string, { parcels: number; owners: number }> = {};
      for (const x of j.markets as { name: string; parcels: number; owners: number }[]) if (x.parcels >= 0) m[x.name] = { parcels: x.parcels, owners: x.owners };
      setInv(m); setInvMsg(`✓ Live inventory loaded — ${Object.values(m).reduce((s, v) => s + v.parcels, 0).toLocaleString()} parcels across our markets`);
    } catch { setInvMsg("network error"); } finally { setInvBusy(false); }
  }
  const invVals = Object.values(inv).map((v) => v.parcels);
  const avgInv = invVals.length ? invVals.reduce((a, b) => a + b, 0) / invVals.length : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-white">
        <span className="text-sm font-extrabold">📊 Where to pull next — ranked by opportunity</span>
        {pullNow > 0 && <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-bold">🔥 {pullNow} market{pullNow > 1 ? "s" : ""} to pull NOW</span>}
        <button onClick={loadInventory} disabled={invBusy} className="ml-auto rounded-lg bg-cyan-500/20 px-2.5 py-1 text-[11px] font-bold text-cyan-200 ring-1 ring-cyan-400/30 hover:bg-cyan-500/30 disabled:opacity-50">{invBusy ? "Counting…" : "📡 Load live land inventory (free)"}</button>
        <button onClick={() => setShowPlay((s) => !s)} className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-bold hover:bg-white/20">📚 {showPlay ? "Hide" : "Show"} playbook</button>
      </div>
      {invMsg && <div className="px-1 text-[11px] text-slate-500">{invMsg}</div>}

      {showPlay && (
        <div className="grid grid-cols-1 gap-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-2">
          {PLAYBOOK.map((p) => (
            <div key={p.name} className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
              <div className="text-[12px] font-bold text-slate-800">{p.name}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">{p.what}</div>
              <div className="mt-1 text-[11px] font-semibold text-emerald-700">→ {p.use}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const p = PRIO[r.priority];
          return (
            <div key={r.id} className={`rounded-2xl bg-white p-3.5 shadow-sm ring-1 ${r.priority === "pull-now" ? "ring-red-200" : "ring-slate-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-extrabold text-white">{r.opportunity}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800">{r.name}</div>
                  <div className="text-[11px] text-slate-500">🟢 {r.buyerCount} buyers · 📥 {r.leads} leads · 🏆 {r.deals} deals{inv[r.name] ? ` · 🏕 ${inv[r.name].parcels.toLocaleString()} land parcels` : ""}</div>
                </div>
                <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${p.cls}`}>{p.label}</span>
                <div className="flex gap-2 text-[10px] font-bold">
                  <span title="Wealth Location Quotient" className={lqCls(r.lq.wealth)}>W {r.lq.wealth}×</span>
                  <span title="Buyer-demand Location Quotient" className={lqCls(r.lq.demand)}>Demand {r.lq.demand}×</span>
                  <span title="Deal-production Location Quotient" className={lqCls(r.lq.deals)}>Deals {r.lq.deals}×</span>
                  {inv[r.name] && avgInv > 0 && <span title="Off-market land supply Location Quotient (DealMachine)" className={lqCls(Math.round((inv[r.name].parcels / avgInv) * 100) / 100)}>Supply {Math.round((inv[r.name].parcels / avgInv) * 100) / 100}×</span>}
                </div>
              </div>
              {r.reasons.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.reasons.map((reason, i) => <span key={i} className="rounded-full bg-slate-50 px-2 py-0.5 text-[10.5px] font-medium text-slate-600 ring-1 ring-slate-200">{reason}</span>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="px-1 text-[10px] text-slate-400">Opportunity = weighted blend of wealth, business, buyer demand, coverage gap, momentum &amp; waterfront. LQ = Location Quotient vs our portfolio average (1.0× = par).</p>
    </div>
  );
}
