"use client";
// 🏕 DealMachine research — count off-market land parcels in any county/city/ZIP against our
// land buy-box, straight from the War Room (Jon 2026-11-05). COUNTS ARE FREE (DealMachine
// credits only burn when we pull/enrich), so researching where to pull costs nothing.
import { useEffect, useState } from "react";

type Loc = { type: "county" | "city" | "zip_code" | "state"; code: string; name: string; state?: string; property_count?: number };
type LandInput = { propertyTypes: number[]; acresMin?: number; acresMax?: number; maxImprovementValue?: number; outOfState: boolean; absentee: boolean; taxDelinquent: boolean; excludeLandlocked: boolean; excludeFlood: boolean };

const PRESETS: { key: string; label: string; emoji: string; input: Partial<LandInput> }[] = [
  { key: "infill", label: "Infill luxury lots", emoji: "🏝️", input: { propertyTypes: [6], acresMin: 0.1, acresMax: 1, maxImprovementValue: 5000, absentee: true, excludeLandlocked: true } },
  { key: "acreage", label: "Big acreage (rec/dev)", emoji: "🌄", input: { propertyTypes: [6, 19], acresMin: 1, acresMax: 20, outOfState: true, excludeLandlocked: true } },
  { key: "commercial", label: "Commercial / dev land", emoji: "🏗️", input: { propertyTypes: [6, 20], acresMin: 0.5, maxImprovementValue: 25000, absentee: true } },
  { key: "absentee", label: "Absentee / out-of-state", emoji: "✈️", input: { propertyTypes: [6], outOfState: true, absentee: true, excludeLandlocked: true } },
  { key: "delinquent", label: "Tax-delinquent (hot)", emoji: "🔥", input: { propertyTypes: [6], taxDelinquent: true, absentee: true } },
];
const DEFAULT: LandInput = { propertyTypes: [6], acresMin: 0.1, acresMax: 5, outOfState: true, absentee: false, taxDelinquent: false, excludeLandlocked: true, excludeFlood: false };

export default function DealMachineResearch({ quickMarkets = [] }: { quickMarkets?: { name: string; fips: string; preset?: string }[] }) {
  const [status, setStatus] = useState<"checking" | "ok" | "needkey" | "off">("checking");
  const [statusMsg, setStatusMsg] = useState("");
  const [locQ, setLocQ] = useState("");
  const [locResults, setLocResults] = useState<Loc[]>([]);
  const [picked, setPicked] = useState<Loc | null>(null);
  const [input, setInput] = useState<LandInput>(DEFAULT);
  const [count, setCount] = useState<{ total_properties: number; total_people: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [log, setLog] = useState<{ area: string; preset: string; props: number; people: number }[]>([]);
  const [pullSize, setPullSize] = useState(25);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState("");

  async function runPull() {
    if (!picked || !count) return;
    const n = Math.min(pullSize, count.total_properties);
    if (!confirm(`Pull ${n} land lead${n > 1 ? "s" : ""} from ${picked.name} into the CRM?\n\nThis SKIP-TRACES the owners and uses roughly ${n} DealMachine credits (one-time). They import as land leads assigned to Michelle, respecting quiet hours. Continue?`)) return;
    setPulling(true); setPullMsg("Pulling + skip-tracing… (do not close)");
    try {
      const r = await fetch("/api/markets/dm/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locations: [{ type: picked.type, code: picked.code }], land: input, perPage: n, areaName: picked.name }) });
      const j = await r.json();
      if (!r.ok) { setPullMsg(`⚠️ ${j.error || "pull failed"}`); return; }
      setPullMsg(`✅ Pulled ${j.pulled} · imported ${j.imported} new land leads${j.duplicates ? ` · ${j.duplicates} already in CRM` : ""}${j.skipped ? ` · ${j.skipped} skipped (no contact)` : ""} · ~${j.creditsUsed} credits used → ${j.assignedTo}${j.markedOnMap ? " · area marked 'pulled' on the map" : ""}. Find them in the Seller CRM.`);
      loadPulls();
    } catch { setPullMsg("network error"); } finally { setPulling(false); }
  }

  const [pulls, setPulls] = useState<{ at: string; by: string; area: string; credits: number; pulled: number }[]>([]);
  const [creditsMo, setCreditsMo] = useState(0);
  function loadPulls() { fetch("/api/markets/dm?action=pulls").then((r) => r.json()).then((j) => { setPulls(j.pulls ?? []); setCreditsMo(j.creditsThisMonth ?? 0); }).catch(() => {}); }
  useEffect(() => {
    fetch("/api/markets/dm?action=ping").then((r) => r.json()).then((j) => {
      if (!j.configured) { setStatus("off"); setStatusMsg("DealMachine key not set in Vercel."); }
      else if (j.countOk) { setStatus("ok"); setStatusMsg(j.detail); }
      else { setStatus("needkey"); setStatusMsg(j.detail || "v2 API not reachable with the current key."); }
    }).catch(() => { setStatus("needkey"); setStatusMsg("couldn't reach DealMachine"); });
    loadPulls();
  }, []);

  async function searchLoc() {
    if (!locQ.trim()) return;
    setErr("");
    try { const r = await fetch(`/api/markets/dm?action=locations&q=${encodeURIComponent(locQ)}`); const j = await r.json(); setLocResults(j.data ?? []); }
    catch { setErr("location search failed"); }
  }
  function applyPreset(p: Partial<LandInput>) { setInput({ ...DEFAULT, ...p } as LandInput); setCount(null); }
  async function runCount() {
    if (!picked) { setErr("pick an area first"); return; }
    setBusy(true); setErr(""); setCount(null);
    try {
      const r = await fetch("/api/markets/dm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locations: [{ type: picked.type, code: picked.code }], land: input }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "count failed"); return; }
      setCount(j.count);
      setLog((l) => [{ area: picked.name, preset: `${input.acresMin ?? "?"}–${input.acresMax ?? "∞"}ac${input.outOfState ? " · OOS" : ""}${input.absentee ? " · absentee" : ""}${input.taxDelinquent ? " · delinquent" : ""}`, props: j.count.total_properties, people: j.count.total_people }, ...l].slice(0, 12));
    } catch { setErr("network error"); } finally { setBusy(false); }
  }
  const set = (k: keyof LandInput, v: unknown) => setInput((i) => ({ ...i, [k]: v }));

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-extrabold text-slate-800">🏕 DealMachine — research off-market land</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status === "ok" ? "bg-emerald-100 text-emerald-700" : status === "checking" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-800"}`}>
          {status === "ok" ? "✓ live" : status === "checking" ? "checking…" : status === "off" ? "key off" : "needs v2 key"}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">counts are FREE · credits only burn when you pull</span>
      </div>
      {status === "needkey" && (
        <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-amber-200">
          {statusMsg} — Generate a v2 key at DealMachine → Settings → API (a <code>dm_sk_live_…</code> key) and add it in Vercel as <code>DEALMACHINE_V2_KEY</code>, then redeploy. Research counts will light up. (Your existing lead integration is untouched.)
        </div>
      )}
      {status === "ok" && <div className="mb-2 text-[11px] text-emerald-700">{statusMsg}</div>}

      {/* 1) Area */}
      <div className="mb-2">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">1 · Area</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <input value={locQ} onChange={(e) => setLocQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchLoc(); }} placeholder="County, city, or ZIP — e.g. Lee County, FL" className="w-64 rounded border border-slate-300 px-2 py-1" />
          <button onClick={searchLoc} className="rounded-lg bg-slate-800 px-2.5 py-1 font-bold text-white hover:bg-slate-700">Find</button>
          {picked && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 ring-1 ring-emerald-200">📍 {picked.name} ({picked.type.replace("_", " ")})</span>}
        </div>
        {quickMarkets.length > 0 && (
          // ⚡ One-click county pick for our target markets (no typing) — FIPS is the county code.
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 self-center">Quick pick:</span>
            {quickMarkets.map((q) => (
              <button key={q.fips} onClick={() => { setPicked({ type: "county", code: q.fips, name: q.name }); setLocResults([]); const p = PRESETS.find((x) => x.key === q.preset); if (p) applyPreset(p.input); }} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${q.fips.startsWith("45") ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"}`} title={`${q.fips.startsWith("45") ? "South Carolina" : "Florida"}${q.preset ? ` · applies ${q.preset} buy-box` : ""}`}>{q.name.split(" / ")[0]}</button>
            ))}
          </div>
        )}
        {locResults.length > 0 && !picked && (
          <div className="mt-1 flex flex-wrap gap-1">
            {locResults.map((l) => (
              <button key={l.code + l.type} onClick={() => { setPicked(l); setLocResults([]); }} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200">{l.name} · {l.type.replace("_", " ")}{l.property_count ? ` · ${l.property_count.toLocaleString()}` : ""}</button>
            ))}
          </div>
        )}
        {picked && <button onClick={() => { setPicked(null); setCount(null); }} className="mt-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600">change area</button>}
      </div>

      {/* 2) Buy-box */}
      <div className="mb-2">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">2 · Land buy-box</div>
        <div className="mb-1.5 flex flex-wrap gap-1">
          {PRESETS.map((p) => <button key={p.key} onClick={() => applyPreset(p.input)} className="rounded-full bg-lime-50 px-2 py-0.5 text-[11px] font-semibold text-lime-800 ring-1 ring-lime-200 hover:bg-lime-100">{p.emoji} {p.label}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          <label className="flex items-center gap-1">Acres <input type="number" step="0.1" value={input.acresMin ?? ""} onChange={(e) => set("acresMin", e.target.value ? Number(e.target.value) : undefined)} className="w-14 rounded border border-slate-300 px-1 py-0.5" /> – <input type="number" step="0.1" value={input.acresMax ?? ""} onChange={(e) => set("acresMax", e.target.value ? Number(e.target.value) : undefined)} className="w-14 rounded border border-slate-300 px-1 py-0.5" /></label>
          <label className="flex items-center gap-1">Max improvement $ <input type="number" value={input.maxImprovementValue ?? ""} onChange={(e) => set("maxImprovementValue", e.target.value ? Number(e.target.value) : undefined)} placeholder="any" className="w-20 rounded border border-slate-300 px-1 py-0.5" /></label>
          <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={input.outOfState} onChange={(e) => set("outOfState", e.target.checked)} /> Out-of-state owner</label>
          <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={input.absentee} onChange={(e) => set("absentee", e.target.checked)} /> Absentee</label>
          <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={input.taxDelinquent} onChange={(e) => set("taxDelinquent", e.target.checked)} /> Tax-delinquent</label>
          <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={input.excludeLandlocked} onChange={(e) => set("excludeLandlocked", e.target.checked)} /> Not landlocked</label>
          <label className="flex cursor-pointer items-center gap-1"><input type="checkbox" checked={input.excludeFlood} onChange={(e) => set("excludeFlood", e.target.checked)} /> Exclude flood zone</label>
        </div>
      </div>

      {/* 3) Count */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={runCount} disabled={busy || !picked || status === "off"} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? "Counting…" : "🔍 Count parcels (free)"}</button>
        {count && (
          <div className="flex items-center gap-3">
            <div><div className="text-2xl font-extrabold tabular-nums text-slate-800">{count.total_properties.toLocaleString()}</div><div className="text-[10px] font-bold uppercase text-slate-400">parcels match</div></div>
            <div><div className="text-2xl font-extrabold tabular-nums text-slate-500">{count.total_people.toLocaleString()}</div><div className="text-[10px] font-bold uppercase text-slate-400">with owners</div></div>
          </div>
        )}
        {err && <span className="text-[12px] font-semibold text-red-600">⚠️ {err}</span>}
      </div>

      {/* 4) Pull (SPENDS CREDITS) — explicit + capped */}
      {count && count.total_properties > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
          <span className="text-[12px] font-bold text-amber-900">⬇️ Pull into the CRM:</span>
          <select value={pullSize} onChange={(e) => setPullSize(Number(e.target.value))} className="rounded border border-amber-300 px-1.5 py-1 text-[12px] font-semibold">
            <option value={25}>first 25</option><option value={50}>first 50</option><option value={100}>first 100</option>
          </select>
          <button onClick={runPull} disabled={pulling} className="rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-amber-700 disabled:opacity-50">{pulling ? "Pulling…" : `Pull ${Math.min(pullSize, count.total_properties)} (~${Math.min(pullSize, count.total_properties)} credits)`}</button>
          <span className="text-[11px] text-amber-700">skip-traces owners · imports as land leads to Michelle</span>
          {pullMsg && <span className="w-full text-[12px] font-semibold text-amber-900">{pullMsg}</span>}
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Research log</div>
          <div className="space-y-0.5 text-[11px]">
            {log.map((e, i) => <div key={i} className="flex gap-2 text-slate-600"><span className="font-bold text-slate-700">{e.props.toLocaleString()}</span> parcels · {e.people.toLocaleString()} owners — <span className="text-slate-500">{e.area} · {e.preset}</span></div>)}
          </div>
        </div>
      )}
      {pulls.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Pull history {creditsMo > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800">~{creditsMo} credits this month</span>}</div>
          <div className="space-y-0.5 text-[11px]">
            {pulls.map((p, i) => <div key={i} className="flex flex-wrap gap-2 text-slate-600"><span className="text-slate-400">{p.at.slice(0, 10)}</span> <span className="font-bold text-slate-700">{p.pulled}</span> from {p.area || "area"} · ~{p.credits} credits · {p.by}</div>)}
          </div>
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-400">Counts are free. Pulling skip-traces the owners and uses credits (~1/lead) — every pull is logged above for cost transparency.</p>
    </div>
  );
}
