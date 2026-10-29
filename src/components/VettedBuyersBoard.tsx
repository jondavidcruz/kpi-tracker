"use client";
// Section 3 wrapper: KPI strip + county coverage heat board + buyer trading cards.
// Clicking a county on the board filters the cards; everything is derived data.
import { useMemo, useState } from "react";
import BuyerCards, { type CardBuyer } from "@/components/BuyerCards";
import type { CoverageRow } from "@/lib/buyers/scorecard";

// 🗺 The county coverage board moved under Map & Markets (Jon 2026-10-29) — this board is
// now just the KPI strip + buyer cards. `coverage` stays in the props for the KPI counts.
export default function VettedBuyersBoard({ buyers, coverage, coldCount }: { buyers: CardBuyer[]; coverage: CoverageRow[]; coldCount: number }) {
  const [county, setCounty] = useState<string>("");
  const kpi = useMemo(() => ({
    total: buyers.length,
    a: buyers.filter((b) => b.tier === "A").length,
    b: buyers.filter((b) => b.tier === "B").length,
    counties: coverage.length,
    strong: coverage.filter((c) => c.a >= 1).length,
    avg: buyers.length ? Math.round(buyers.reduce((s, b) => s + b.score, 0) / buyers.length * 10) / 10 : 0,
    paused: buyers.filter((b) => b.paused).length,
  }), [buyers, coverage]);

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { l: "Vetted buyers", v: kpi.total, c: "text-slate-800" },
          { l: "A-tier (send first)", v: kpi.a, c: "text-emerald-700" },
          { l: "B-tier", v: kpi.b, c: "text-amber-700" },
          { l: "Counties covered", v: kpi.counties, c: "text-indigo-700", sub: `${kpi.strong} with an A buyer` },
          { l: "Avg vetting score", v: `${kpi.avg}/10`, c: "text-slate-800" },
          { l: "Going cold / paused", v: `${coldCount} / ${kpi.paused}`, c: coldCount > 10 ? "text-red-600" : "text-slate-800" },
        ].map((k) => (
          <div key={k.l} className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k.l}</div>
            <div className={`text-xl font-black tabular-nums ${k.c}`}>{k.v}</div>
            {k.sub && <div className="text-[10px] text-slate-400">{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Trading cards */}
      <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-800">🃏 Buyer cards</span>
          <span className="text-[11px] text-slate-500">ring = 10-point vetting scorecard · A = complete box + cash/POF + active + responsive · the spreadsheet is still below for edits</span>
        </div>
        <BuyerCards buyers={buyers} selectedCounty={county || undefined} onCountyClear={() => setCounty("")} />
      </div>
    </div>
  );
}
