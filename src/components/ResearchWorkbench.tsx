"use client";
// 🔬 Research Workbench — research a market BEFORE you pull. Pick a county/city/ZIP, dial the
// land + owner-motivation buy-box, and watch the FREE live count update as you go (0 credits).
// When the pool and the market read both look right, the Filter Recipe is your handoff — replicate
// it in DealMachine to pull. Replaces the old 🏕 DealMachine panel (research-first, per Jon's flow:
// "the main thing I use this map for is research first, before we start actually pulling").
import { useEffect, useRef, useState } from "react";
import {
  CATALOG, PRESETS, NICHE_PRESETS, DEFAULT_STATE, PROPERTY_TYPE_OPTS, compileFilters, describeFilters, activeCount,
  type WorkbenchState, type Control, type NichePreset, type NicheArea,
} from "@/lib/dm-filter-catalog";
import type { DemandResult, RecommendedMarket } from "@/lib/buyer-demand-markets";
import { ELITE_ENCLAVES, type Enclave } from "@/lib/elite-markets";
import { lawForState, RATING_META } from "@/lib/wholesale-law";

type Loc = { type: "county" | "city" | "zip_code" | "state"; code: string; name: string; state?: string; property_count?: number };
type Glance = { name: string; state: string; tier: "target" | "watch" | "low"; price: number | null; yoy: number | null; dtp: number | null; landShare: number | null; landHigh: number | null; landTotal: number | null };

const clone = (s: WorkbenchState): WorkbenchState => ({ enums: { ...s.enums }, bools: { ...s.bools }, nums: { ...s.nums }, strs: { ...(s.strs ?? {}) } });

type Cov = { status: "never" | "clear" | "cooldown"; cooldownLeft: number; lastPull: string | null; pulls90d?: number; totalCount?: number };
type Stats = { leads: number; deals: number; wealth: number };

export default function ResearchWorkbench({ quickMarkets = [], scan = {}, demand, coverage = {}, marketStats = {} }: { quickMarkets?: { name: string; fips: string }[]; scan?: Record<string, Glance>; demand?: DemandResult; coverage?: Record<string, Cov>; marketStats?: Record<string, Stats> }) {
  const [status, setStatus] = useState<"checking" | "ok" | "needkey" | "off">("checking");
  const [statusMsg, setStatusMsg] = useState("");
  const [locQ, setLocQ] = useState("");
  const [locResults, setLocResults] = useState<Loc[]>([]);
  const [picked, setPicked] = useState<Loc | null>(null);
  const [state, setState] = useState<WorkbenchState>(() => clone(DEFAULT_STATE));
  const [count, setCount] = useState<{ total_properties: number; total_people: number } | null>(null);
  const [counting, setCounting] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [showAllRecs, setShowAllRecs] = useState(false);
  const [openRec, setOpenRec] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showEnclaves, setShowEnclaves] = useState(false);
  const [niche, setNiche] = useState<string | null>(null);
  const reqSeq = useRef(0);

  useEffect(() => {
    fetch("/api/markets/dm?action=ping").then((r) => r.json()).then((j) => {
      if (!j.configured) { setStatus("off"); setStatusMsg("DealMachine key not set in Vercel — filters still work, but live counts need it."); }
      else if (j.countOk) { setStatus("ok"); setStatusMsg(j.detail || ""); }
      else { setStatus("needkey"); setStatusMsg(j.detail || "v2 API not reachable with the current key."); }
    }).catch(() => { setStatus("needkey"); setStatusMsg("couldn't reach DealMachine"); });
  }, []);

  // 🔴 Live FREE count — debounced. Re-runs on every filter/area change. Counting costs no credits,
  // so this is the whole point: dial the buy-box and watch the pool move in real time.
  useEffect(() => {
    if (!picked || status === "off") { setCount(null); return; }
    const seq = ++reqSeq.current;
    setCounting(true); setErr("");
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/markets/dm", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locations: [{ type: picked.type, code: picked.code }], filters: compileFilters(state) }),
        });
        const j = await r.json();
        if (seq !== reqSeq.current) return; // a newer request superseded this one
        if (!r.ok) { setErr(j.error || "count failed"); setCount(null); }
        else setCount(j.count);
      } catch { if (seq === reqSeq.current) setErr("network error"); }
      finally { if (seq === reqSeq.current) setCounting(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [picked, state, status]);

  async function searchLoc() {
    if (!locQ.trim()) return;
    setErr("");
    try { const r = await fetch(`/api/markets/dm?action=locations&q=${encodeURIComponent(locQ)}`); const j = await r.json(); setLocResults(j.data ?? []); }
    catch { setErr("location search failed"); }
  }

  // 📍 Elite enclave → resolve its city/ZIP via DealMachine, pick it, and apply the 🏗 developer-lots
  // filter (big valuable buildable lots, not penny lots). Pulls BELOW the county level (Jon's gold).
  async function pickEnclave(enc: Enclave) {
    setErr("");
    try {
      const r = await fetch(`/api/markets/dm?action=locations&q=${encodeURIComponent(enc.q)}`);
      const j = await r.json();
      const loc = (j.data ?? [])[0];
      if (loc) {
        setPicked(loc); setLocResults([]);
        const dev = PRESETS.find((p) => p.key === "developer_lots");
        if (dev) setState(dev.state());
      } else { setLocQ(enc.q); setErr(`No DealMachine match for ${enc.name} — try the Find box.`); }
    } catch { setErr("enclave lookup failed"); }
  }

  // 🎯 Niche sniper → load the countable buy-box (property type + value/acre/owner/flood gates) and
  // surface the geo steps you then apply on the map. The live count runs once an area is picked.
  function applyNiche(p: NichePreset) {
    setState(p.state());
    setNiche(p.key);
    setShowFilters(false);
  }
  // Pick a recommended hunt-area for the active niche WITHOUT resetting the niche buy-box.
  async function pickNicheArea(a: NicheArea) {
    setErr("");
    try {
      const r = await fetch(`/api/markets/dm?action=locations&q=${encodeURIComponent(a.q)}`);
      const j = await r.json();
      const loc = (j.data ?? [])[0];
      if (loc) {
        setPicked(loc); setLocResults([]);
        if (typeof window !== "undefined") window.scrollTo({ top: (document.getElementById("rw-buybox")?.offsetTop ?? 0) - 80, behavior: "smooth" });
      } else { setLocQ(a.q); setErr(`No DealMachine match for ${a.name} — try the Find box.`); }
    } catch { setErr("area lookup failed"); }
  }

  // Load a buyer-demand recommendation into the workbench: pick the county + apply its derived
  // buy-box → the live count runs automatically. This is the gold loop (demand → recipe → count).
  function loadRec(m: RecommendedMarket) {
    setPicked({ type: "county", code: m.fips, name: `${m.name}, ${m.state}` });
    setState(clone(m.recipe));
    setNiche(null);
    setLocResults([]); setOpenRec(null);
    if (typeof window !== "undefined") window.scrollTo({ top: (document.getElementById("rw-buybox")?.offsetTop ?? 0) - 80, behavior: "smooth" });
  }

  const glance = picked && picked.type === "county" ? scan[picked.code] : undefined;
  const cov = picked && picked.type === "county" ? coverage[picked.code] : undefined;
  const stats = picked && picked.type === "county" ? marketStats[picked.code] : undefined;
  const recipe = describeFilters(state);
  const nActive = activeCount(state);

  // control mutators
  const setEnum = (id: string, optId: number) => setState((s) => {
    const cur = s.enums[id] ?? []; const next = cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId];
    return { ...s, enums: { ...s.enums, [id]: next } };
  });
  const toggleBool = (id: string) => setState((s) => ({ ...s, bools: { ...s.bools, [id]: !s.bools[id] } }));
  const setNum = (id: string, key: "min" | "max", v: string) => setState((s) => {
    const cur = { ...(s.nums[id] ?? {}) };
    if (v === "") delete cur[key]; else cur[key] = Number(v);
    const nums = { ...s.nums }; if (cur.min == null && cur.max == null) delete nums[id]; else nums[id] = cur;
    return { ...s, nums };
  });
  const setStr = (id: string, v: string) => setState((s) => {
    const strs = { ...(s.strs ?? {}) }; if (v === "") delete strs[id]; else strs[id] = v;
    return { ...s, strs };
  });

  function copyRecipe() {
    const text = (glance ? `${glance.name}, ${glance.state}\n` : picked ? `${picked.name}\n` : "") + recipe.map((l) => "• " + l).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }

  function renderControl(c: Control) {
    if (c.kind === "enum") {
      const sel = state.enums[c.id] ?? [];
      return (
        <div key={c.id} className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[11px] font-semibold text-slate-600">{c.label}</span>
          {c.options.map((o) => (
            <button key={o.id} onClick={() => setEnum(c.id, o.id)}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sel.includes(o.id) ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{o.label}</button>
          ))}
        </div>
      );
    }
    if (c.kind === "bool") {
      const on = !!state.bools[c.id];
      return (
        <button key={c.id} onClick={() => toggleBool(c.id)} title={c.hint}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${on ? (c.apply === false ? "bg-rose-50 text-rose-700 ring-rose-300" : "bg-emerald-50 text-emerald-700 ring-emerald-300") : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"}`}>
          {on ? "✓ " : ""}{c.emoji ? c.emoji + " " : ""}{c.label}
        </button>
      );
    }
    if (c.kind === "str") {
      return (
        <label key={c.id} className="flex items-center gap-1 text-[11px] text-slate-600" title={c.hint}>
          <span className="font-semibold">{c.label}</span>
          <input type="text" value={(state.strs ?? {})[c.id] ?? ""} onChange={(e) => setStr(c.id, e.target.value)} placeholder={c.hint ?? "text"} className="w-28 rounded border border-slate-300 px-1 py-0.5" />
        </label>
      );
    }
    const r = state.nums[c.id] ?? {};
    return (
      <label key={c.id} className="flex items-center gap-1 text-[11px] text-slate-600" title={c.hint}>
        <span className="font-semibold">{c.label}{c.hint && !c.money ? ` (${c.hint})` : ""}</span>
        {c.money && <span className="text-slate-400">$</span>}
        <input type="number" step={c.step ?? 1} value={r.min ?? ""} onChange={(e) => setNum(c.id, "min", e.target.value)} placeholder="min" className="w-20 rounded border border-slate-300 px-1 py-0.5" />
        {!c.minOnly && <>–<input type="number" step={c.step ?? 1} value={r.max ?? ""} onChange={(e) => setNum(c.id, "max", e.target.value)} placeholder="max" className="w-20 rounded border border-slate-300 px-1 py-0.5" /></>}
      </label>
    );
  }

  const tierPill = (t: Glance["tier"]) => t === "target" ? "bg-emerald-100 text-emerald-700" : t === "watch" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500";

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold text-slate-800">🔬 Research Workbench</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status === "ok" ? "bg-emerald-100 text-emerald-700" : status === "checking" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-800"}`}>
          {status === "ok" ? "✓ live counts" : status === "checking" ? "checking…" : status === "off" ? "counts need key" : "needs v2 key"}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">research before you pull · counts are FREE</span>
      </div>
      {(status === "needkey" || status === "off") && (
        <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-amber-200">
          {statusMsg} Add a <code>dm_sk_live_…</code> key from DealMachine → Settings → API in Vercel as <code>DEALMACHINE_V2_KEY</code>, then redeploy. You can still build + copy a filter recipe below without it.
        </div>
      )}

      {/* 🎯 Recommended by your vetted buyers — the gold loop: demand → recipe → count */}
      {demand && (
        <div className="mb-3 rounded-xl bg-gradient-to-br from-emerald-50 to-cyan-50 p-3 ring-1 ring-emerald-200">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-extrabold text-emerald-900">🎯 Pull where your buyers are hungry</span>
            <span className="text-[11px] text-emerald-700">ranked from {demand.vettedBuyers} vetted buy-box{demand.vettedBuyers === 1 ? "" : "es"} · new markets first</span>
            {demand.broadBuyers > 0 && <span className="text-[10px] text-emerald-600">· {demand.broadBuyers} nationwide/state-only (not county-ranked)</span>}
          </div>
          {demand.markets.length === 0 ? (
            <div className="rounded-lg bg-white/70 px-3 py-2 text-[11px] text-slate-500">
              No vetted buyer buy-boxes resolved to a FL/SC county yet. Capture buy-box areas on your vetted developers (county names) and they'll rank here.
              {demand.unresolvedAreas.length > 0 && <span className="text-slate-400"> Unmapped areas seen: {demand.unresolvedAreas.join(", ")}.</span>}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {(showAllRecs ? demand.markets : demand.markets.slice(0, 6)).map((m) => {
                  const tierCls = m.scanTier === "target" ? "text-emerald-700" : m.scanTier === "watch" ? "text-amber-700" : "text-slate-500";
                  return (
                    <div key={m.fips} className="w-60 rounded-lg bg-white p-2.5 shadow-sm ring-1 ring-slate-200">
                      <div className="flex items-start gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-bold text-slate-800">{m.name.replace(/ County$/, "")}, {m.state}</div>
                          <div className="flex flex-wrap items-center gap-1 text-[10px]">
                            <span className="font-semibold text-slate-600">👥 {m.buyers}</span>
                            {m.momPop > 0 && <span className="text-emerald-600">🏠{m.momPop}</span>}
                            {m.bigBuilder > 0 && <span className="text-slate-400">🏢{m.bigBuilder}</span>}
                          </div>
                        </div>
                        <span className={`rounded bg-slate-50 px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums ${tierCls}`} title="opportunity score">{m.score}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-bold uppercase">
                        {m.newMarket && <span className="rounded bg-violet-100 px-1 py-0.5 text-violet-700">🆕 new</span>}
                        {m.coverage === "never" && !m.newMarket && <span className="rounded bg-sky-100 px-1 py-0.5 text-sky-700">never pulled</span>}
                        {m.coverage === "cooldown" && <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-700">⏳ {m.cooldownLeft}d</span>}
                        {m.landSharePct != null && <span className="rounded bg-emerald-100 px-1 py-0.5 text-emerald-700">💎 {m.landSharePct}% ≥$100k</span>}
                        {m.priceCeil != null && <span className="rounded bg-slate-100 px-1 py-0.5 text-slate-500">≤${(m.priceCeil / 1000).toFixed(0)}k</span>}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1">
                        <button onClick={() => loadRec(m)} className="flex-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">Research this →</button>
                        <button onClick={() => setOpenRec(openRec === m.fips ? null : m.fips)} className="rounded bg-slate-100 px-1.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-200" title="why">{openRec === m.fips ? "×" : "?"}</button>
                      </div>
                      {openRec === m.fips && (
                        <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-[10px] text-slate-600">
                          {m.reasons.map((r, i) => <div key={i}>• {r}</div>)}
                          {m.buyerNames.length > 0 && <div className="mt-1 text-slate-400">Wants it: {m.buyerNames.join(", ")}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {demand.markets.length > 6 && (
                <button onClick={() => setShowAllRecs((v) => !v)} className="mt-1.5 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900">
                  {showAllRecs ? "show fewer" : `show all ${demand.markets.length} →`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* 1 · Area */}
      <div className="mb-3">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">1 · Where</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <input value={locQ} onChange={(e) => setLocQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") searchLoc(); }} placeholder="County, city, or ZIP — e.g. Collier County, FL" className="w-64 rounded border border-slate-300 px-2 py-1" />
          <button onClick={searchLoc} className="rounded-lg bg-slate-800 px-2.5 py-1 font-bold text-white hover:bg-slate-700">Find</button>
          {picked && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 ring-1 ring-emerald-200">📍 {picked.name} ({picked.type.replace("_", " ")})</span>}
          {picked && <button onClick={() => { setPicked(null); setCount(null); }} className="text-[10px] font-semibold text-slate-400 hover:text-slate-600">change</button>}
        </div>
        {quickMarkets.length > 0 && !picked && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="self-center text-[10px] font-bold uppercase tracking-wide text-slate-400">Quick pick:</span>
            {quickMarkets.map((q) => (
              <button key={q.fips} onClick={() => { setPicked({ type: "county", code: q.fips, name: q.name }); setLocResults([]); }}
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${q.fips.startsWith("45") ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100"}`}
                title={q.fips.startsWith("45") ? "South Carolina" : "Florida"}>{q.name.split(" / ")[0]}</button>
            ))}
          </div>
        )}
        {!picked && (
          // 🏆 Elite enclaves — the high-value SUB-COUNTY targets (Winter Park, Port Royal, …); a
          // click resolves the city/ZIP + applies the 🏗 developer-lots filter (big, valuable lots).
          <div className="mt-1.5 rounded-lg bg-amber-50/70 p-2 ring-1 ring-amber-200">
            <button onClick={() => setShowEnclaves((v) => !v)} className="flex w-full items-center text-[10px] font-bold uppercase tracking-wide text-amber-700 hover:opacity-80">
              <span>🏆 Elite enclaves — the high-value sub-markets</span>
              <span className="ml-auto">{showEnclaves ? "▾ hide" : `▸ show ${ELITE_ENCLAVES.length}`}</span>
            </button>
            {showEnclaves && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {ELITE_ENCLAVES.map((e) => (
                  <button key={e.name} onClick={() => pickEnclave(e)} title={`${e.region} · wealth ${e.wealth.toFixed(1)}/5 · applies 🏗 developer-lots`}
                    className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">{e.name}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {locResults.length > 0 && !picked && (
          <div className="mt-1 flex flex-wrap gap-1">
            {locResults.map((l) => (
              <button key={l.code + l.type} onClick={() => { setPicked(l); setLocResults([]); }} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200">{l.name} · {l.type.replace("_", " ")}{l.property_count ? ` · ${l.property_count.toLocaleString()}` : ""}</button>
            ))}
          </div>
        )}
      </div>

      {/* ⚖️ Wholesaling-law read for this state — so you don't pour pulls into an attorney/restricted
          state (Jon 2026-11-11). Orientation only; full detail on the State Laws tab. */}
      {picked?.state && (() => {
        const law = lawForState(picked.state);
        if (!law) return null;
        const m = RATING_META[law.rating];
        return (
          <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[11px] ring-1 ${m.cls}`}>
            <span className="font-bold">{m.dot} {law.name} — {m.label} to wholesale</span>
            {law.attorneyState && <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">⚖️ attorney state</span>}
            <span>· {law.verdict.replace(/^[🟢🟡🔴]\s*/u, "")}</span>
            <span className="ml-auto text-[10px] opacity-70">orientation only · see ⚖️ State Laws tab</span>
          </div>
        );
      })()}

      {/* At-a-glance market read */}
      {glance && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tierPill(glance.tier)}`}>{glance.tier}</span>
          <span className="text-[11px] text-slate-600"><b className="text-slate-800">{glance.price != null ? "$" + glance.price.toLocaleString() : "—"}</b> home median{glance.yoy != null ? <span className={glance.yoy >= 0 ? "text-emerald-600" : "text-rose-600"}> · {glance.yoy >= 0 ? "+" : ""}{glance.yoy}% YoY</span> : null}</span>
          <span className="text-[11px] text-slate-600"><b className="text-slate-800">{glance.dtp != null ? glance.dtp : "—"}</b> days→pending</span>
          {glance.landShare != null && <span className="text-[11px] text-slate-600"><b className="text-slate-800">{Math.round(glance.landShare * 100)}%</b> of land ≥$100k{glance.landHigh != null && glance.landTotal != null ? ` (${glance.landHigh.toLocaleString()}/${glance.landTotal.toLocaleString()})` : ""}</span>}
          <span className="ml-auto text-[10px] text-slate-400">market read · from the Finder scan</span>
        </div>
      )}

      {/* 🎯 Pull verdict — don't waste pulls on dead ground. Combines coverage (pulled? cooldown?)
          with the pipeline results this area actually produced (Jon 2026-11-11). */}
      {(cov || stats) && (() => {
        const deals = stats?.deals ?? 0, leads = stats?.leads ?? 0;
        const pulledBefore = !!cov && cov.status !== "never";
        let vClass = "bg-sky-100 text-sky-700", vText = "🆕 Fresh ground — never pulled here";
        if (cov?.status === "cooldown") { vClass = "bg-amber-100 text-amber-800"; vText = `⏳ Cooldown — ${cov.cooldownLeft}d before re-pull`; }
        else if (pulledBefore && deals > 0) { vClass = "bg-emerald-100 text-emerald-800"; vText = `⭐ Proven — produced ${deals} deal${deals > 1 ? "s" : ""} · worth pulling again`; }
        else if (pulledBefore && leads > 0) { vClass = "bg-amber-100 text-amber-800"; vText = `🟡 Pulled — ${leads} lead${leads > 1 ? "s" : ""}, 0 deals yet · re-pull cautiously`; }
        else if (pulledBefore) { vClass = "bg-red-100 text-red-700"; vText = "🔴 Dead ground — pulled, nothing produced · skip"; }
        else if (glance && glance.tier === "low") { vClass = "bg-slate-100 text-slate-600"; vText = "⚪ Unproven — never pulled, lower-tier market"; }
        return (
          <div className="mb-3 -mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className={`rounded-full px-2 py-0.5 font-bold ${vClass}`}>{vText}</span>
            {pulledBefore && <span className="text-slate-500">pulled {cov!.pulls90d ?? 0}×/90d{cov!.totalCount ? ` · ${cov!.totalCount.toLocaleString()} owners` : ""}{cov!.lastPull ? ` · last ${cov!.lastPull.slice(0, 10)}` : ""}</span>}
            {stats && <span className="text-slate-500">📥 {leads} leads · 🏆 {deals} deals here{stats.wealth ? ` · 💰 wealth ${stats.wealth}/5` : ""}</span>}
          </div>
        );
      })()}

      {/* 2 · Pick your hunt — presets are the whole job for most people; the full filter grid is
          tucked behind "Customize" so the default view stays simple (Jon 2026-11-08: "too many
          things to look at, make it dummy-proof"). */}
      <div className="mb-3" id="rw-buybox">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">2 · Pick your hunt</div>
        {/* 🎯 Niche snipers — Jon's focus plays. One click loads the countable buy-box + the geo steps
            to refine on the map (sniper pulls, not county pulls). Full intel on the 🎯 Niches tab. */}
        <div className="mb-2 rounded-xl bg-gradient-to-br from-sky-50 to-indigo-50 p-2.5 ring-1 ring-sky-200">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-extrabold text-indigo-900">🎯 Niche snipers</span>
            <span className="text-[11px] text-indigo-600">sell the use, not the dirt · full intel on the 🎯 Niches tab</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {NICHE_PRESETS.map((p) => (
              <button key={p.key} onClick={() => applyNiche(p)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ring-1 ${niche === p.key ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-indigo-800 ring-indigo-300 hover:bg-indigo-50"}`}>{p.emoji} {p.label}</button>
            ))}
            {niche && <button onClick={() => { setNiche(null); setState(clone(DEFAULT_STATE)); }} className="text-[10px] font-semibold text-slate-400 hover:text-slate-600">clear</button>}
          </div>
          {niche && (() => {
            const p = NICHE_PRESETS.find((x) => x.key === niche);
            if (!p) return null;
            return (
              <div className="mt-2 rounded-lg bg-white/80 p-2.5 ring-1 ring-indigo-100">
                <div className="text-[11px] font-semibold text-slate-700">{p.blurb}</div>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">✓ Counting now</div>
                    <ul className="mt-0.5 space-y-0.5 text-[11px] text-slate-600">{p.autoApplied.map((l, i) => <li key={i}>• {l}</li>)}</ul>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-amber-600">⚑ Then refine (map / pull)</div>
                    <ul className="mt-0.5 space-y-0.5 text-[11px] text-slate-600">{p.refine.map((l, i) => <li key={i}>• {l}</li>)}</ul>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Hunt here:</span>
                  {p.areas.map((a) => (
                    <button key={a.q} onClick={() => pickNicheArea(a)} title={`research ${a.q}`}
                      className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100">
                      {a.name}{a.badge ? <span className="ml-1 text-[9px] text-indigo-400">{a.badge}</span> : null}
                    </button>
                  ))}
                  <span className="ml-auto text-[10px] text-slate-400">click an area → live count runs</span>
                </div>
              </div>
            );
          })()}
        </div>
        {/* presets — the general buy-boxes */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => { setState(p.state()); setShowFilters(false); setNiche(null); }}
              className="rounded-lg bg-lime-50 px-3 py-1.5 text-[12px] font-bold text-lime-800 ring-1 ring-lime-300 hover:bg-lime-100">{p.emoji} {p.label}</button>
          ))}
        </div>
        {/* what's currently set — so they see the filters without the grid */}
        {nActive > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-[11px] ring-1 ring-slate-200">
            <span className="font-bold text-slate-500">On:</span>
            <span className="text-slate-700">{recipe.filter((l) => !l.startsWith("Property type")).slice(0, 4).join(" · ") || "land only"}{nActive > 4 ? ` · +${nActive - 4} more` : ""}</span>
            <button onClick={() => { setState(clone(DEFAULT_STATE)); setNiche(null); }} className="ml-auto text-[10px] font-semibold text-slate-400 hover:text-slate-600">reset</button>
          </div>
        )}
        {/* customize — everything detailed lives here, collapsed by default */}
        <button onClick={() => setShowFilters((v) => !v)} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">
          {showFilters ? "▾ Hide filters" : "⚙️ Customize filters"}
        </button>
        {showFilters && (
          <div className="mt-2 space-y-2.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            {CATALOG.filter((g) => !g.advanced).map((g) => (
              <div key={g.key}>
                <div className="mb-1 text-[11px] font-bold text-slate-700">{g.emoji} {g.title} <span className="font-normal text-slate-400">— {g.blurb}</span></div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">{g.controls.map(renderControl)}</div>
              </div>
            ))}
            <div className="border-t border-slate-200 pt-2">
              <button onClick={() => setShowAdvanced((v) => !v)} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">
                {showAdvanced ? "▾ Hide extra filters" : `▸ ${CATALOG.filter((g) => g.advanced).reduce((n, g) => n + g.controls.length, 0)} more filters`}
              </button>
              {showAdvanced && (
                <div className="mt-2 space-y-2.5">
                  {CATALOG.filter((g) => g.advanced).map((g) => (
                    <div key={g.key}>
                      <div className="mb-1 text-[11px] font-bold text-slate-700">{g.emoji} {g.title}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">{g.controls.map(renderControl)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3 · Live result */}
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Live count {counting && <span className="text-slate-300">· counting…</span>}</div>
          {!picked ? <div className="text-[13px] text-slate-400">pick an area to see the pool</div> : status === "off" ? <div className="text-[13px] text-amber-600">add the key for live counts</div> : (
            <div className="flex items-center gap-4">
              <div><div className={`text-3xl font-extrabold tabular-nums ${counting ? "text-slate-300" : "text-slate-800"}`}>{count ? count.total_properties.toLocaleString() : "—"}</div><div className="text-[10px] font-bold uppercase text-slate-400">parcels match</div></div>
              <div><div className={`text-3xl font-extrabold tabular-nums ${counting ? "text-slate-300" : "text-slate-500"}`}>{count ? count.total_people.toLocaleString() : "—"}</div><div className="text-[10px] font-bold uppercase text-slate-400">mailable owners</div></div>
            </div>
          )}
          {err && <span className="text-[12px] font-semibold text-red-600">⚠️ {err}</span>}
        </div>

        {/* Filter recipe — the handoff to DealMachine */}
        <div className="ml-auto max-w-sm flex-1 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-700">📋 Filter recipe</span>
            <button onClick={copyRecipe} className="ml-auto rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-slate-700">{copied ? "✓ copied" : "copy"}</button>
          </div>
          <div className="space-y-0.5 text-[11px] text-slate-600">
            {recipe.map((l, i) => <div key={i}>• {l}</div>)}
          </div>
          <div className="mt-1.5 text-[10px] text-slate-400">Replicate this in DealMachine to pull these owners.</div>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-slate-400">Counts are free and update live as you filter. This is the research step — when the pool + market read look right, pull in DealMachine using the recipe.</p>
    </div>
  );
}
