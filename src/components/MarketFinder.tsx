"use client";
// 🔎 Market Finder — ranked, filterable scan of EVERY county from free public data, to discover
// the next high-margin land market (Jon 2026-11-07). Opportunity score blends home-price tier +
// YoY trend + days-to-pending liquidity + (when the DealMachine key is live) the share of land
// assessing ≥$100k. Cheap-land markets (Lehigh-Acres style) are demoted automatically.
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScanStore, CountyScan } from "@/lib/market-scan";

const TIER: Record<CountyScan["tier"], { label: string; dot: string; row: string }> = {
  target: { label: "🎯 Target", dot: "bg-emerald-500", row: "bg-emerald-50/60" },
  watch: { label: "👀 Watch", dot: "bg-amber-500", row: "" },
  low: { label: "🔻 Low", dot: "bg-slate-400", row: "opacity-70" },
};
type SortKey = "score" | "medianSalePrice" | "yoyPct" | "daysToPending" | "landHigh" | "inventory";
const money = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
const pct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n}%`);

export default function MarketFinder({ initial, canRefresh }: { initial: ScanStore | null; canRefresh: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"ALL" | "FL" | "SC">("ALL");
  const [minPrice, setMinPrice] = useState(0);
  const [maxDtp, setMaxDtp] = useState(0); // 0 = no cap
  const [hideCheap, setHideCheap] = useState(true);
  const [tierFilter, setTierFilter] = useState<"all" | "target" | "watch">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const all = initial?.counties ?? [];
  const rows = useMemo(() => {
    let r = all.filter((c) => {
      if (state !== "ALL" && c.state !== state) return false;
      if (minPrice && (c.medianSalePrice ?? 0) < minPrice) return false;
      if (maxDtp && (c.daysToPending ?? 9999) > maxDtp) return false;
      if (tierFilter !== "all" && c.tier !== tierFilter) return false;
      if (hideCheap && c.land && c.land.highShare < 0.05 && c.land.cheapShare > 0.6) return false;
      if (q.trim() && !`${c.name} ${c.metro}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });
    const key = (c: CountyScan): number => {
      switch (sort) {
        case "medianSalePrice": return c.medianSalePrice ?? -1;
        case "yoyPct": return c.yoyPct ?? -999;
        case "daysToPending": return c.daysToPending == null ? 99999 : c.daysToPending; // asc-ish
        case "landHigh": return c.land?.highShare ?? -1;
        case "inventory": return c.inventory ?? -1;
        default: return c.score;
      }
    };
    r = [...r].sort((a, b) => (sort === "daysToPending" ? key(a) - key(b) : key(b) - key(a)));
    return r;
  }, [all, state, minPrice, maxDtp, hideCheap, tierFilter, q, sort]);

  async function refresh(withLand: boolean) {
    setBusy(true); setMsg(withLand ? "Scanning public data + land values… (up to ~45s)" : "Refreshing market data…");
    try {
      const r = await fetch(`/api/markets/scan?refresh=1${withLand ? "&land=1" : ""}&states=FL,SC`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.ok === false) { setMsg(j.error || "refresh failed"); return; }
      setMsg(`✅ Updated ${j.counties?.length ?? 0} counties${j.landEnrichedThisRun ? ` · land for ${j.landEnrichedThisRun} more` : ""}`);
      router.refresh();
    } catch { setMsg("network error"); } finally { setBusy(false); }
  }

  const landLive = initial?.landConfigured;
  const th = "px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 cursor-pointer select-none hover:text-slate-600";
  const sortArrow = (k: SortKey) => (sort === k ? " ↓" : "");

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-extrabold text-slate-900">🔎 Market Finder</h2>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">NEW</span>
        <span className="text-xs text-slate-500">
          Scans every FL &amp; SC county from free public data to find the next high-margin land market.
        </span>
        {canRefresh && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => refresh(false)} disabled={busy} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50">🔄 Refresh prices</button>
            <button onClick={() => refresh(true)} disabled={busy} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">🏕 Refresh + land values</button>
          </div>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        {initial?.zillowAsOf && <span>Home data through <b className="text-slate-600">{initial.zillowAsOf}</b> (Zillow)</span>}
        <span>Land values: {landLive ? <b className="text-emerald-600">live (DealMachine)</b> : <b className="text-amber-600">pending v2 key — prices/trend still live</b>}</span>
        {busy && <span className="text-indigo-600">{msg}</span>}
        {!busy && msg && <span>{msg}</span>}
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <select value={state} onChange={(e) => setState(e.target.value as "ALL" | "FL" | "SC")} className="rounded-lg border border-slate-300 px-2 py-1 font-semibold">
          <option value="ALL">All states</option><option value="FL">Florida</option><option value="SC">South Carolina</option>
        </select>
        <select value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1">
          <option value={0}>Any home price</option><option value={300000}>≥ $300k</option><option value={400000}>≥ $400k</option><option value={500000}>≥ $500k</option><option value={750000}>≥ $750k</option>
        </select>
        <select value={maxDtp} onChange={(e) => setMaxDtp(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1">
          <option value={0}>Any days-to-pending</option><option value={30}>≤ 30 days</option><option value={45}>≤ 45 days</option><option value={60}>≤ 60 days</option>
        </select>
        <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value as "all" | "target" | "watch")} className="rounded-lg border border-slate-300 px-2 py-1">
          <option value="all">All tiers</option><option value="target">🎯 Targets only</option><option value="watch">👀 Watch+</option>
        </select>
        <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" checked={hideCheap} onChange={(e) => setHideCheap(e.target.checked)} /> Hide cheap-land</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search county / metro" className="w-44 rounded-lg border border-slate-300 px-2 py-1" />
        <span className="ml-auto font-semibold text-slate-500">{rows.length} markets</span>
      </div>

      {all.length === 0 ? (
        <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
          No scan yet. {canRefresh ? "Click “🔄 Refresh prices” to build it (free, ~5s)." : "Ask Jon to run the first scan."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">Market</th>
                <th className={th} onClick={() => setSort("score")}>Opportunity{sortArrow("score")}</th>
                <th className={th} onClick={() => setSort("medianSalePrice")}>Home median{sortArrow("medianSalePrice")}</th>
                <th className={th} onClick={() => setSort("yoyPct")}>YoY{sortArrow("yoyPct")}</th>
                <th className={th} onClick={() => setSort("daysToPending")}>Days→pending{sortArrow("daysToPending")}</th>
                <th className={th} onClick={() => setSort("landHigh")}>Land ≥$100k{sortArrow("landHigh")}</th>
                <th className={th} onClick={() => setSort("inventory")}>For sale{sortArrow("inventory")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Fragment key={c.fips}>
                  <tr className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${TIER[c.tier].row}`} onClick={() => setOpen(open === c.fips ? null : c.fips)}>
                    <td className="px-2 py-1.5">
                      <div className="font-semibold text-slate-800">{c.name.replace(/ County$/, "")}<span className="ml-1 text-[10px] font-normal text-slate-400">{c.state}</span></div>
                      {c.metro && <div className="text-[10px] text-slate-400">{c.metro.split(",")[0]}</div>}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="inline-flex items-center gap-1 font-bold text-slate-800"><span className={`inline-block h-2 w-2 rounded-full ${TIER[c.tier].dot}`} />{c.score}</span>
                      <span className="ml-1 text-[10px] text-slate-400">{TIER[c.tier].label}</span>
                    </td>
                    <td className="px-2 py-1.5 font-semibold text-slate-700">{money(c.medianSalePrice)}</td>
                    <td className={`px-2 py-1.5 font-semibold ${c.yoyPct == null ? "text-slate-400" : c.yoyPct >= 0 ? "text-emerald-600" : "text-rose-500"}`}>{pct(c.yoyPct)}</td>
                    <td className="px-2 py-1.5 text-slate-600">{c.daysToPending == null ? "—" : `${Math.round(c.daysToPending)}d`}</td>
                    <td className="px-2 py-1.5 text-slate-600">{c.land ? `${Math.round(c.land.highShare * 100)}%` : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-slate-500">{c.inventory == null ? "—" : Math.round(c.inventory).toLocaleString()}</td>
                  </tr>
                  {open === c.fips && (
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <td colSpan={7} className="px-3 py-2">
                        <ul className="space-y-0.5 text-[11px] text-slate-600">
                          {c.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                          {c.land && (
                            <li className="pt-1 text-slate-500">Land breakdown — ≤$40k: <b>{c.land.cheap.toLocaleString()}</b> · $100–200k: <b>{c.land.sweet.toLocaleString()}</b> · ≥$200k: <b>{c.land.prem.toLocaleString()}</b> · total land parcels: <b>{c.land.total.toLocaleString()}</b></li>
                          )}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-400">
        Opportunity = home-price tier + YoY trend + days-to-pending liquidity{landLive ? " + share of land assessing ≥$100k" : ""}. Click a row for the why. Land value is the assessor&apos;s land value (reliable), not the land AVM.
      </p>
    </section>
  );
}
