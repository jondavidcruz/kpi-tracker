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

// ── CFD / contract-for-deed calculator ────────────────────────────────────
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
        🌱 <strong>Land tools</strong> — owner-finance (CFD) exit math + the acre converter. Land OFFERS live in the calculator above — Cash (Land), Developer, or Novation. <span className="font-mono">(43,560 sq ft = 1 acre)</span>
      </div>
      <AcreConverter />
      <CfdCalc />
    </div>
  );
}
