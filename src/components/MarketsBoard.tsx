"use client";
import { useMemo, useState } from "react";
import { logPullAction, setMarketTrendAction, setMarketStatusAction } from "@/app/markets/actions";
import HaloMarketMap, { type ScanPt } from "@/components/HaloMarketMap";
import type { LeadPin } from "@/lib/lead-pins";
import type { BuyerCoverage } from "@/lib/buyer-coverage-map";
import MarketAnalysisPanel from "@/components/MarketAnalysisPanel";
import type { TargetMarket, Coverage, LandFocus } from "@/lib/target-markets";

// Inlined (not imported from target-markets, which pulls in the server-only db client).
const LAND_FOCUS_META: Record<LandFocus, { label: string; emoji: string }> = {
  acreage: { label: "Big acreage lots", emoji: "🌄" },
  infill_luxury: { label: "Infill luxury lots", emoji: "🏝️" },
  commercial: { label: "Commercial land", emoji: "🏗️" },
};

export type Momentum = { d30: number; d60: number; d180: number; trend: "up" | "flat" | "down" | "" };
export type MarketView = { m: TargetMarket; coverage: Coverage; leads: number; deals: number; momentum: Momentum; buyerCount: number };

const TREND_META: Record<string, { label: string; cls: string }> = {
  up: { label: "📈 Trending up", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  flat: { label: "➡️ Flat", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  down: { label: "📉 Cooling", cls: "bg-red-100 text-red-700 ring-red-200" },
};
const COV_META: Record<Coverage["status"], { label: (c: Coverage) => string; cls: string; dot: string }> = {
  never: { label: () => "Never pulled — open field", cls: "text-slate-500", dot: "bg-slate-300" },
  clear: { label: (c) => `Clear to pull · last ${c.lastPull}`, cls: "text-emerald-700", dot: "bg-emerald-500" },
  cooldown: { label: (c) => `Cooldown ${c.cooldownLeft}d · last ${c.lastPull}`, cls: "text-amber-700", dot: "bg-amber-500" },
};

function ScoreBar({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-2 w-3 rounded-sm ${i <= Math.round(n) ? "bg-brand-navy" : "bg-slate-200"}`} />)}
      </div>
      <span className="text-[10px] font-bold tabular-nums text-slate-500">{n}</span>
    </div>
  );
}

export default function MarketsBoard({ markets, canEdit, buyerPoints = [], geocodeRemaining = 0, territories = [], terrStats = {}, scanPoints = [], leadPins = [], leadZipsRemaining = 0, buyerCoverage = [], pullStats = {} }: { markets: MarketView[]; canEdit: boolean; buyerPoints?: { lat: number; lng: number }[]; geocodeRemaining?: number; territories?: import("@/lib/map-territories").Territory[]; terrStats?: Record<string, { leads: number; deals: number }>; scanPoints?: ScanPt[]; leadPins?: LeadPin[]; leadZipsRemaining?: number; buyerCoverage?: BuyerCoverage[]; pullStats?: Record<string, { leads: number; contractSent: number; closed: number; value: number }> }) {
  const [focus, setFocus] = useState<"" | LandFocus>("");
  const [cov, setCov] = useState<"" | Coverage["status"]>("");
  const [openPull, setOpenPull] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "cards" | "analysis">("map");
  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => markets.filter((v) =>
    (!focus || v.m.landFocus.includes(focus)) && (!cov || v.coverage.status === cov)
  ), [markets, focus, cov]);

  const openCount = markets.filter((v) => v.coverage.status !== "cooldown").length;

  return (
    <div className="space-y-3">
      {/* Filters + legend */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-bold text-slate-500">Land focus:</span>
        <button onClick={() => setFocus("")} className={`rounded-full px-2.5 py-1 font-bold ring-1 ${focus === "" ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-600 ring-slate-200"}`}>All</button>
        {(Object.keys(LAND_FOCUS_META) as LandFocus[]).map((k) => (
          <button key={k} onClick={() => setFocus(k)} className={`rounded-full px-2.5 py-1 font-bold ring-1 ${focus === k ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-600 ring-slate-200"}`}>{LAND_FOCUS_META[k].emoji} {LAND_FOCUS_META[k].label}</button>
        ))}
        <span className="ml-3 font-bold text-slate-500">Coverage:</span>
        {([["", "All"], ["never", "Never pulled"], ["clear", "Clear"], ["cooldown", "Cooldown"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setCov(k as "" | Coverage["status"])} className={`rounded-full px-2.5 py-1 font-bold ring-1 ${cov === k ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-600 ring-slate-200"}`}>{lbl}</button>
        ))}
        <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700 ring-1 ring-emerald-200">{openCount} markets clear to pull</span>
        <div className="flex overflow-hidden rounded-full ring-1 ring-slate-200">
          <button onClick={() => setView("map")} className={`px-2.5 py-1 font-bold ${view === "map" ? "bg-brand-navy text-white" : "bg-white text-slate-600"}`}>🗺 Map</button>
          <button onClick={() => setView("cards")} className={`px-2.5 py-1 font-bold ${view === "cards" ? "bg-brand-navy text-white" : "bg-white text-slate-600"}`}>▦ Cards</button>
          <button onClick={() => setView("analysis")} className={`px-2.5 py-1 font-bold ${view === "analysis" ? "bg-brand-navy text-white" : "bg-white text-slate-600"}`}>📊 Analysis</button>
        </div>
      </div>

      {view === "analysis" && <MarketAnalysisPanel markets={rows} />}
      {view === "map" && <HaloMarketMap markets={rows} buyerPoints={buyerPoints} geocodeRemaining={geocodeRemaining} canEdit={canEdit} territories={territories} terrStats={terrStats} scanPoints={scanPoints} leadPins={leadPins} leadZipsRemaining={leadZipsRemaining} buyerCoverage={buyerCoverage} pullStats={pullStats} />}

      <div className={`grid grid-cols-1 gap-3 lg:grid-cols-2 ${view !== "cards" ? "hidden" : ""}`}>
        {rows.map(({ m, coverage, leads, deals, momentum }) => {
          const c = COV_META[coverage.status];
          return (
            <div key={m.id} className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${m.status === "paused" ? "opacity-60 ring-slate-200" : coverage.status === "clear" || coverage.status === "never" ? "ring-emerald-200" : "ring-amber-200"}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-extrabold text-slate-800">{m.name}</div>
                    {m.waterfront && <span title="Waterfront / oceanfront wealth — the wealthy keep building here through rate hikes" className="shrink-0 rounded-full bg-cyan-100 px-1.5 py-0.5 text-[9px] font-bold text-cyan-700 ring-1 ring-cyan-200">🌊 Waterfront</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">{m.region} · {m.profile}</div>
                </div>
                {m.trend && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${TREND_META[m.trend].cls}`}>{TREND_META[m.trend].label}</span>}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <ScoreBar label="Wealth" n={m.wealth} />
                <ScoreBar label="Business" n={m.business} />
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {m.landFocus.map((f) => <span key={f} className="rounded-full bg-lime-50 px-1.5 py-0.5 text-[10px] font-semibold text-lime-800 ring-1 ring-lime-200">{LAND_FOCUS_META[f].emoji} {LAND_FOCUS_META[f].label}</span>)}
              </div>

              {m.enclaves.length > 0 && <div className="mt-1.5 text-[11px] text-slate-500"><span className="font-semibold text-slate-600">Enclaves:</span> {m.enclaves.join(" · ")}</div>}

              {/* Coverage + performance */}
              <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
                <div><div className="text-[9px] font-bold uppercase text-slate-400">Coverage</div><div className={`flex items-center gap-1 text-[11px] font-semibold ${c.cls}`}><span className={`inline-block h-2 w-2 rounded-full ${c.dot}`} />{coverage.status === "never" ? "Never" : coverage.status === "clear" ? "Clear" : `${coverage.cooldownLeft}d`}</div></div>
                <div><div className="text-[9px] font-bold uppercase text-slate-400">Pulled (90d)</div><div className="text-[13px] font-extrabold tabular-nums text-slate-700">{coverage.pulls90d}<span className="text-[10px] font-semibold text-slate-400"> · {coverage.totalCount.toLocaleString()} leads</span></div></div>
                <div><div className="text-[9px] font-bold uppercase text-slate-400">Deals / leads</div><div className="text-[13px] font-extrabold tabular-nums text-slate-700">{deals}<span className="text-[10px] font-semibold text-slate-400">/{leads} in CRM</span></div></div>
              </div>
              <div className={`mt-1 text-[11px] ${c.cls}`}>{c.label(coverage)}</div>

              {/* 📊 30-60-180 momentum (auto, from our own pipeline — free) */}
              <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                <span className="font-bold text-slate-400">30/60/180:</span>
                <span className="font-extrabold tabular-nums text-slate-700">{momentum.d30}<span className="text-slate-300"> / </span>{momentum.d60}<span className="text-slate-300"> / </span>{momentum.d180}</span>
                <span className="text-slate-400">leads</span>
                {momentum.trend && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${TREND_META[momentum.trend].cls}`}>{TREND_META[momentum.trend].label}</span>}
              </div>

              {/* Actions */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button onClick={() => setOpenPull(openPull === m.id ? null : m.id)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">➕ Log a pull</button>
                {canEdit && (
                  <form action={setMarketTrendAction} className="flex items-center gap-1">
                    <input type="hidden" name="marketId" value={m.id} />
                    <select name="trend" defaultValue={m.trend} onChange={(e) => e.currentTarget.form?.requestSubmit()} title="Your 30-60-180 read" className="rounded-lg border border-slate-200 px-1.5 py-1 text-[11px] font-semibold text-slate-600">
                      <option value="">Trend…</option>
                      <option value="up">📈 Up</option>
                      <option value="flat">➡️ Flat</option>
                      <option value="down">📉 Down</option>
                    </select>
                  </form>
                )}
                {canEdit && (
                  <form action={setMarketStatusAction} className="ml-auto flex items-center gap-1">
                    <input type="hidden" name="marketId" value={m.id} />
                    <select name="status" defaultValue={m.status} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="rounded-lg border border-slate-200 px-1.5 py-1 text-[11px] font-semibold text-slate-600">
                      <option value="target">🎯 Target</option>
                      <option value="active">🔥 Active</option>
                      <option value="paused">⏸ Paused</option>
                    </select>
                  </form>
                )}
              </div>

              {openPull === m.id && (
                <form action={logPullAction} className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl bg-emerald-50/60 p-2 ring-1 ring-emerald-100">
                  <input type="hidden" name="marketId" value={m.id} />
                  <label className="text-[10px] font-bold text-slate-500">Date<input type="date" name="date" defaultValue={today} className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]" /></label>
                  <label className="text-[10px] font-bold text-slate-500"># leads pulled<input name="count" inputMode="numeric" placeholder="e.g. 250" className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]" /></label>
                  <label className="text-[10px] font-bold text-slate-500">Source<select name="source" className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"><option>DealMachine</option><option>DirectREI</option><option>Regrid</option><option>PropStream</option><option>Other</option></select></label>
                  <label className="text-[10px] font-bold text-slate-500">Land type<select name="landType" className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"><option value="acreage">Big acreage</option><option value="infill_luxury">Infill luxury</option><option value="commercial">Commercial</option><option value="mixed">Mixed</option></select></label>
                  <input name="note" placeholder="Note (zip / filter / list name)…" className="col-span-2 rounded border border-slate-200 px-1.5 py-1 text-[11px]" />
                  <div className="col-span-2"><button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700">Save pull</button></div>
                </form>
              )}
            </div>
          );
        })}
      </div>
      {rows.length === 0 && <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 ring-1 ring-slate-200">No markets match this filter.</div>}
    </div>
  );
}
