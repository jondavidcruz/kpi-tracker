"use client";

import { useMemo, useState } from "react";

const money = (n: number) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : "—");
const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const lbl = "block text-[11px] font-semibold text-slate-500 mb-0.5";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      {children}
    </div>
  );
}

// ── 1. Land offer calculator (course auto-rules) ─────────────────────────────
function OfferCalc() {
  const [mode, setMode] = useState<"cash" | "infill">("cash");
  const [estValue, setEstValue] = useState("");
  const [assessed, setAssessed] = useState("");
  const [cheapestComp, setCheapestComp] = useState("");
  const [acres, setAcres] = useState("");
  const [buyBox, setBuyBox] = useState("");
  const [spreadPct, setSpreadPct] = useState("30");

  const n = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
  const r = useMemo(() => {
    const ev = n(estValue), asr = n(assessed), comp = n(cheapestComp), ac = n(acres), bb = n(buyBox), sp = n(spreadPct) / 100;
    const caps: { label: string; value: number }[] = [];
    if (mode === "cash") {
      if (ev > 0) caps.push({ label: "≤ ⅓ of est. value (Hunter rule)", value: ev / 3 });
      if (asr > 0) caps.push({ label: "≤ county assessed value", value: asr });
      if (comp > 0) caps.push({ label: "undercut cheapest active comp (−15%)", value: comp * 0.85 });
    } else {
      if (bb > 0 && sp > 0) caps.push({ label: `builder buy-box − ${Math.round(sp * 100)}% spread`, value: bb * (1 - sp) });
      if (asr > 0) caps.push({ label: "≤ county assessed value", value: asr });
    }
    const offer = caps.length ? Math.min(...caps.map((c) => c.value)) : 0;
    const perAcre = ac > 0 && offer > 0 ? offer / ac : 0;
    return { caps, offer, perAcre };
  }, [mode, estValue, assessed, cheapestComp, acres, buyBox, spreadPct]);

  return (
    <Card title="🎯 Land offer calculator">
      <div className="mb-3 inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
        {(["cash", "infill"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 text-xs font-semibold ${mode === m ? "bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-slate-100" : "text-slate-500"}`}>
            {m === "cash" ? "Cash (rural land)" : "Infill (builder)"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {mode === "cash" ? (
          <>
            <label><span className={lbl}>Est. market value</span><input value={estValue} onChange={(e) => setEstValue(e.target.value)} className={inputCls} placeholder="$" /></label>
            <label><span className={lbl}>County assessed</span><input value={assessed} onChange={(e) => setAssessed(e.target.value)} className={inputCls} placeholder="$" /></label>
            <label><span className={lbl}>Cheapest active comp</span><input value={cheapestComp} onChange={(e) => setCheapestComp(e.target.value)} className={inputCls} placeholder="$" /></label>
          </>
        ) : (
          <>
            <label><span className={lbl}>Builder buy-box price</span><input value={buyBox} onChange={(e) => setBuyBox(e.target.value)} className={inputCls} placeholder="$" /></label>
            <label><span className={lbl}>Target spread %</span><input value={spreadPct} onChange={(e) => setSpreadPct(e.target.value)} className={inputCls} placeholder="12–50" /></label>
            <label><span className={lbl}>County assessed</span><input value={assessed} onChange={(e) => setAssessed(e.target.value)} className={inputCls} placeholder="$ (optional)" /></label>
          </>
        )}
        <label><span className={lbl}>Acreage (for $/acre)</span><input value={acres} onChange={(e) => setAcres(e.target.value)} className={inputCls} placeholder="acres" /></label>
      </div>

      <div className="mt-4 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Max offer (lowest cap wins)</div>
        <div className="text-3xl font-extrabold text-emerald-800 dark:text-emerald-200">{money(r.offer)}</div>
        {r.perAcre > 0 && <div className="text-sm text-emerald-700 dark:text-emerald-300">{money(r.perAcre)} / acre</div>}
      </div>
      {r.caps.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          {r.caps.map((c, i) => (
            <li key={i} className={c.value === r.offer ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""}>
              {c.value === r.offer ? "→ " : "• "}{c.label}: {money(c.value)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-400">Rules of thumb from the land courses. Always verify comps, access, and title before sending.</p>
    </Card>
  );
}

// ── 2. Blind-offer batch calculator (mail merge) ─────────────────────────────
function BatchCalc() {
  const [raw, setRaw] = useState("");
  const [method, setMethod] = useState<"pct" | "perAcre">("pct");
  const [pct, setPct] = useState("33");
  const [perAcre, setPerAcre] = useState("2000");
  const [round, setRound] = useState("100");

  const n = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
  const rows = useMemo(() => {
    const factor = method === "pct" ? n(pct) / 100 : n(perAcre);
    const rnd = Math.max(1, n(round));
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[,\t]/).map((p) => p.trim());
        // last numeric column is the driver (value for %, acres for $/acre)
        const label = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
        const driver = n(parts[parts.length - 1]);
        const offerRaw = method === "pct" ? driver * factor : driver * factor;
        const offer = Math.round(offerRaw / rnd) * rnd;
        return { label, driver, offer };
      });
  }, [raw, method, pct, perAcre, round]);

  const csv = useMemo(
    () => "label,input,offer\n" + rows.map((r) => `${r.label.replace(/,/g, " ")},${r.driver},${r.offer}`).join("\n"),
    [rows],
  );

  return (
    <Card title="📋 Blind-offer batch calculator">
      <p className="mb-2 text-xs text-slate-500">
        Paste one property per line — <code>label, {method === "pct" ? "value" : "acres"}</code> (or just the {method === "pct" ? "value" : "acres"}).
        Generates an offer column you can paste into your mail-merge sheet.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="sm:col-span-1"><span className={lbl}>Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as "pct" | "perAcre")} className={inputCls}>
            <option value="pct">% of value</option>
            <option value="perAcre">$ per acre</option>
          </select>
        </label>
        {method === "pct"
          ? <label><span className={lbl}>Offer %</span><input value={pct} onChange={(e) => setPct(e.target.value)} className={inputCls} /></label>
          : <label><span className={lbl}>$ / acre</span><input value={perAcre} onChange={(e) => setPerAcre(e.target.value)} className={inputCls} /></label>}
        <label><span className={lbl}>Round to nearest $</span><input value={round} onChange={(e) => setRound(e.target.value)} className={inputCls} /></label>
      </div>
      <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} className={`${inputCls} mt-3 font-mono`} placeholder={"123 Main Pkwy, 40000\n456 Rural Rd, 25000"} />
      {rows.length > 0 && (
        <>
          <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-1.5">Label</th><th className="px-3 py-1.5 text-right">Input</th><th className="px-3 py-1.5 text-right">Offer</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800"><td className="px-3 py-1.5">{r.label}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{r.driver.toLocaleString()}</td><td className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{money(r.offer)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => navigator.clipboard?.writeText(csv)} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">Copy CSV ({rows.length} offers)</button>
        </>
      )}
    </Card>
  );
}

// ── 3. CFD / contract-for-deed calculator ────────────────────────────────────
function CfdCalc() {
  const [price, setPrice] = useState("");
  const [down, setDown] = useState("");
  const [rate, setRate] = useState("12");
  const [term, setTerm] = useState("5");
  const [targetPmt, setTargetPmt] = useState("500");

  const n = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
  const calc = useMemo(() => {
    const p = n(price), d = n(down), annual = n(rate) / 100, yrs = n(term);
    const principal = Math.max(0, p - d);
    const mr = annual / 12;
    const months = yrs * 12;
    const payment = months > 0 ? (mr > 0 ? (principal * mr) / (1 - Math.pow(1 + mr, -months)) : principal / months) : 0;
    const totalPaid = payment * months + d;
    const interest = payment * months - principal;

    // Solve: what price hits the target monthly payment?
    const tp = n(targetPmt);
    const solvedPrincipal = mr > 0 ? (tp * (1 - Math.pow(1 + mr, -months))) / mr : tp * months;
    const solvedPrice = solvedPrincipal + d;
    return { principal, payment, totalPaid, interest, months, solvedPrice };
  }, [price, down, rate, term, targetPmt]);

  return (
    <Card title="💵 CFD / owner-finance calculator">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label><span className={lbl}>Sale price</span><input value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} placeholder="$" /></label>
        <label><span className={lbl}>Down payment</span><input value={down} onChange={(e) => setDown(e.target.value)} className={inputCls} placeholder="$" /></label>
        <label><span className={lbl}>Rate % (10–20)</span><input value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} /></label>
        <label><span className={lbl}>Term (yrs, 3–8)</span><input value={term} onChange={(e) => setTerm(e.target.value)} className={inputCls} /></label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Monthly payment</div>
          <div className="text-3xl font-extrabold text-emerald-800 dark:text-emerald-200">{money(calc.payment)}<span className="text-base font-semibold">/mo</span></div>
          <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{calc.months} pmts · principal {money(calc.principal)} · interest {money(calc.interest)} · total in {money(calc.totalPaid)}</div>
        </div>
        <div className="rounded-xl bg-sky-50 p-4 dark:bg-sky-950">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Price to hit a target payment</div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-sky-700 dark:text-sky-300">Target</span>
            <input value={targetPmt} onChange={(e) => setTargetPmt(e.target.value)} className={`${inputCls} w-24`} />
            <span className="text-sm text-sky-700 dark:text-sky-300">/mo →</span>
          </div>
          <div className="mt-1 text-2xl font-extrabold text-sky-800 dark:text-sky-200">{money(calc.solvedPrice)}</div>
          <div className="text-xs text-sky-700 dark:text-sky-300">sale price at {rate}% / {term} yr with {money(n(down))} down</div>
        </div>
      </div>
    </Card>
  );
}

// Quick acre ⇄ sq ft converter (infill lots are usually quoted in sq ft).
function AcreConverter() {
  const ACRE = 43560;
  const [acres, setAcres] = useState("");
  const [sqft, setSqft] = useState("");
  const n = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm dark:border-emerald-800 dark:bg-emerald-950">
      <div className="font-semibold text-emerald-900 dark:text-emerald-200">📐 Acre ⇄ sq ft — <span className="font-mono">43,560 sq ft = 1 acre</span></div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-emerald-900 dark:text-emerald-200">
        <input value={acres} onChange={(e) => { setAcres(e.target.value); setSqft(e.target.value ? Math.round(n(e.target.value) * ACRE).toString() : ""); }} placeholder="acres" className={`${inputCls} w-28`} />
        <span className="font-semibold">acres =</span>
        <input value={sqft} onChange={(e) => { setSqft(e.target.value); setAcres(e.target.value ? (n(e.target.value) / ACRE).toFixed(3).replace(/\.?0+$/, "") : ""); }} placeholder="sq ft" className={`${inputCls} w-36`} />
        <span className="font-semibold">sq ft</span>
      </div>
    </div>
  );
}

export default function LandTools() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        🌱 <strong>Land tools</strong> — offer auto-rules, batch blind offers for mail merge, and owner-finance (CFD) math for the land pivot. <span className="font-mono">(43,560 sq ft = 1 acre)</span>
      </div>
      <AcreConverter />
      <div className="grid gap-4 lg:grid-cols-2">
        <OfferCalc />
        <CfdCalc />
      </div>
      <BatchCalc />
    </div>
  );
}
