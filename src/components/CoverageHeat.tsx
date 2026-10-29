"use client";
// 🗺 County coverage heat board — where we actually have buyers. Moved under Map & Markets
// (Jon 2026-10-29). Self-contained: state filter + click a county to see its buyers.
import { useMemo, useState } from "react";
import { TierBadge } from "@/components/BuyerCards";
import type { CoverageRow } from "@/lib/buyers/scorecard";

function heat(a: number, total: number): string {
  if (a >= 3) return "bg-emerald-600 text-white";
  if (a === 2) return "bg-emerald-500 text-white";
  if (a === 1) return "bg-emerald-300 text-emerald-950";
  if (total >= 2) return "bg-amber-200 text-amber-900";
  return "bg-slate-100 text-slate-600";
}

export default function CoverageHeat({ coverage }: { coverage: CoverageRow[] }) {
  const [county, setCounty] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [stateF, setStateF] = useState("");
  const states = useMemo(() => [...new Set(coverage.map((c) => c.state))].sort(), [coverage]);
  const rows = coverage.filter((c) => !stateF || c.state === stateF);
  const shown = showAll ? rows : rows.slice(0, 36);

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">🗺 Coverage — where we can actually sell</span>
        <span className="text-[11px] text-slate-500">county shade = # of A-tier buyers · click a county to see its buyers</span>
        <div className="ml-auto flex overflow-hidden rounded-lg ring-1 ring-slate-200">
          <button onClick={() => setStateF("")} className={`px-2 py-1 text-[11px] font-bold ${!stateF ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>All</button>
          {states.map((s) => <button key={s} onClick={() => setStateF(s)} className={`px-2 py-1 text-[11px] font-bold ${stateF === s ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>{s}</button>)}
        </div>
      </div>
      {coverage.length === 0 ? (
        <p className="text-xs text-slate-400">No county data yet — fill buyers&apos; structured buy boxes (counties / regions) and this lights up.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((c) => (
              <button key={c.county} onClick={() => setCounty(county === c.county ? "" : c.county)}
                title={`${c.county}: ${c.a} A · ${c.b} B · ${c.c} C\n${c.buyers.map((b) => `${b.tier} ${b.name}`).join("\n")}`}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-black/5 transition ${heat(c.a, c.total)} ${county === c.county ? "outline outline-2 outline-indigo-500" : ""}`}>
                {c.county.replace(/, [A-Z]{2}$/, "")} <span className="opacity-70">{c.state}</span> <span className="ml-1 rounded bg-black/10 px-1 text-[10px] tabular-nums">{c.a}·{c.total}</span>
              </button>
            ))}
          </div>
          {rows.length > 36 && <button onClick={() => setShowAll(!showAll)} className="mt-2 text-[11px] font-semibold text-slate-400 hover:text-brand-navy">{showAll ? "▴ fewer" : `▾ show all ${rows.length} counties`}</button>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600 align-middle" />3+ A buyers</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300 align-middle" />1 A buyer</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-200 align-middle" />B/C only — thin, don&apos;t market to sellers here yet</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-100 align-middle ring-1 ring-slate-200" />1 buyer</span>
          </div>
          {county && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-[11px] ring-1 ring-indigo-100">
              <b className="text-indigo-800">{county}:</b>
              {coverage.find((c) => c.county === county)?.buyers.sort((x, y) => x.tier.localeCompare(y.tier)).map((b) => <span key={b.id} className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 ring-1 ring-indigo-100"><TierBadge tier={b.tier} /> {b.name}</span>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
