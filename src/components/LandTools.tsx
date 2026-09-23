"use client";

/**
 * Land Calculators — Land Comps & Value · Seller-Financing Note · Offer Calculator.
 * Replaces the old Acre Converter + CFD calc (the Seller-Financing Note IS the
 * CFD/owner-finance math, now with a full schedule). Same route/mount as before
 * (/underwriting → <LandTools />). Nothing is persisted — scratchpad only.
 * Formulas and copy ported EXACTLY from Jon's page.tsx (2026-09-23); only the
 * styling was translated from its scoped CSS to War Room Tailwind.
 */

import { useMemo, useState } from "react";

/* ---------- helpers ---------- */
const money = (n: number, cents = false) =>
  (isFinite(n) ? n : 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
const pct = (n: number, d = 1) => (isFinite(n) ? n : 0).toFixed(d) + "%";
const num = (n: number, d = 0) =>
  (isFinite(n) ? n : 0).toLocaleString("en-US", { maximumFractionDigits: d });
const toNum = (v: string) => {
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
};
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
};
/** Standard amortized payment; 0% → straight line. */
const pmt = (principal: number, annualRate: number, months: number) => {
  if (!(principal > 0) || !(months > 0)) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
};
type AmRow = { n: number; pay: number; prin: number; interest: number; bal: number };
const amortize = (principal: number, annualRate: number, months: number): AmRow[] => {
  const pay = pmt(principal, annualRate, months);
  const r = annualRate / 100 / 12;
  let bal = principal;
  const rows: AmRow[] = [];
  for (let i = 1; i <= months; i++) {
    const interest = bal * r;
    let prin = pay - interest;
    let p = pay;
    if (i === months || prin > bal) {
      prin = bal;
      p = prin + interest; // final payment clears rounding drift
    }
    bal = Math.max(0, bal - prin);
    rows.push({ n: i, pay: p, prin, interest, bal });
  }
  return rows;
};

/* ---------- defaults ---------- */
type CompRow = { price: string; acres: string; adj: string };
const COMP_DEFAULT: { acres: string; rows: CompRow[] } = {
  acres: "5",
  rows: [
    { price: "24000", acres: "5", adj: "0" },
    { price: "18500", acres: "4.2", adj: "0" },
    { price: "31000", acres: "6.1", adj: "0" },
    { price: "", acres: "", adj: "" },
    { price: "", acres: "", adj: "" },
    { price: "", acres: "", adj: "" },
  ],
};
const NOTE_DEFAULT = { price: "25000", down: "2500", rate: "10", years: "5" };
const OFFER_DEFAULT = { emv: "30000", offer: "9000" };

const OFFER_BANDS = [
  {
    lo: 0,
    hi: 1 / 3,
    label: "under 33%",
    what: "Buy it outright — or JV it",
    cls: "green",
    why: "Under a third of EMV is a deal we buy with our own cash, or joint-venture on. This is the sweet spot.",
  },
  {
    lo: 1 / 3,
    hi: 0.5,
    label: "33–50%",
    what: "Most likely a joint venture",
    cls: "orange",
    why: "Between 33% and 50% of EMV there's still a spread, but not enough to tie up cash — bring a JV partner to fund it and split the profit.",
  },
  {
    lo: 0.5,
    hi: Infinity,
    label: "over 50%",
    what: "Double close — if the margin still works",
    cls: "blue",
    why: "Over 50% of EMV, don't buy it: get it under contract and double close to an end buyer, as long as the spread after both closings is worth it.",
  },
];

type Tab = "comp" | "note" | "offer";

/* ---------- War Room styling ---------- */
const cardCls = "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900";
const noteCls = "text-[13px] leading-snug text-slate-500 dark:text-slate-400";
const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const wrapCls = "flex items-center rounded-lg border border-slate-300 bg-white px-2.5 focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-200 dark:border-slate-600 dark:bg-slate-800";
const innerInputCls = "w-full min-w-0 flex-1 border-0 bg-transparent px-1.5 py-2 text-sm text-slate-800 focus:outline-none dark:text-slate-100";
const affixCls = "text-[13px] text-slate-400";
const btnCls = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300";
const primaryBtnCls = "rounded-lg bg-brand-gold px-4 py-2 text-sm font-bold text-brand-navy hover:opacity-90";
const thCls = "border-b border-slate-200 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700";
const tdCls = "border-b border-slate-100 px-2 py-1.5 dark:border-slate-800";
const PILL: Record<string, string> = {
  green: "bg-emerald-500 text-white",
  orange: "bg-amber-400 text-slate-900",
  blue: "bg-blue-600 text-white",
};

/* ---------- small UI bits ---------- */
const Kpi = ({ n, l }: { n: string; l: string }) => (
  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
    <div className="text-xl font-extrabold leading-tight tabular-nums text-slate-900 dark:text-slate-100">{n}</div>
    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{l}</div>
  </div>
);
const Field = ({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = "1",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) => (
  <label className="flex flex-col gap-1">
    <span className={labelCls}>{label}</span>
    <span className={wrapCls}>
      {prefix && <span className={affixCls}>{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={innerInputCls}
      />
      {suffix && <span className={affixCls}>{suffix}</span>}
    </span>
  </label>
);

/* Little acre ⇄ sq ft reference strip (kept from the old Land Tools — Jon). */
function AcreRef() {
  const [ac, setAc] = useState("1");
  const [sf, setSf] = useState("43560");
  const fromAc = (v: string) => { setAc(v); const n = toNum(v); setSf(n > 0 ? String(Math.round(n * 43560)) : ""); };
  const fromSf = (v: string) => { setSf(v); const n = toNum(v); setAc(n > 0 ? String(Math.round((n / 43560) * 10000) / 10000) : ""); };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-slate-50 px-4 py-2.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">📐 Quick reference</span>
      <span className={`${wrapCls} w-36`}><input type="number" inputMode="decimal" step="0.01" value={ac} onChange={(e) => fromAc(e.target.value)} className={innerInputCls} /><span className={affixCls}>ac</span></span>
      <span className="text-slate-400">=</span>
      <span className={`${wrapCls} w-40`}><input type="number" inputMode="decimal" value={sf} onChange={(e) => fromSf(e.target.value)} className={innerInputCls} /><span className={affixCls}>sq ft</span></span>
      <span className="text-xs text-slate-400">1 acre = 43,560 sq ft</span>
    </div>
  );
}

/* ====================================================================== */
export default function LandTools() {
  const [tab, setTab] = useState<Tab>("comp");

  /* ---- comps state ---- */
  const [acres, setAcres] = useState(COMP_DEFAULT.acres);
  const [comps, setComps] = useState<CompRow[]>(COMP_DEFAULT.rows);
  const setComp = (i: number, k: keyof CompRow, v: string) =>
    setComps((c) => c.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  /* ---- note state ---- */
  const [note, setNote] = useState(NOTE_DEFAULT);
  const [showAll, setShowAll] = useState(false);

  /* ---- offer state ---- */
  const [offer, setOffer] = useState(OFFER_DEFAULT);

  /* ---- comps calc ---- */
  const comp = useMemo(() => {
    const ac = toNum(acres);
    const rows = comps
      .map((r, i) => {
        const price = toNum(r.price);
        const a = toNum(r.acres);
        let adj = parseFloat(r.adj);
        if (!isFinite(adj)) adj = 0;
        adj = Math.max(-90, Math.min(200, adj));
        return { n: i + 1, price, acres: a, adj, ppa: price / a, adjPpa: (price / a) * (1 + adj / 100) };
      })
      .filter((r) => r.price > 0 && r.acres > 0);
    const ppas = rows.map((r) => r.adjPpa);
    const avg = ppas.length ? ppas.reduce((a, b) => a + b, 0) / ppas.length : 0;
    const med = median(ppas);
    const lo = ppas.length ? Math.min(...ppas) : 0;
    const hi = ppas.length ? Math.max(...ppas) : 0;
    let warn = "";
    if (rows.length && rows.length < 3)
      warn = `Add at least 3 comps — one or two sales can be flukes. ${3 - rows.length} more to go.`;
    else if (rows.length && ac) {
      const far = rows.filter((r) => r.acres > ac * 3 || r.acres < ac / 3).length;
      if (far)
        warn = `${far} of your comps ${far === 1 ? "is" : "are"} more than 3× bigger or smaller than your parcel — $/acre shifts a lot with size, so weight those lightly.`;
    }
    const ok = rows.length > 0 && ac > 0;
    return { ac, rows, avg, med, lo, hi, warn, ok, likely: med * ac };
  }, [acres, comps]);

  /* ---- note calc ---- */
  const nt = useMemo(() => {
    const price = toNum(note.price);
    const down = Math.min(toNum(note.down), price);
    const rate = toNum(note.rate);
    const years = toNum(note.years);
    const months = Math.round(years * 12);
    const principal = price - down;
    const rows = principal > 0 && months > 0 ? amortize(principal, rate, months) : [];
    let totalPaid = 0,
      totalInt = 0;
    rows.forEach((r) => {
      totalPaid += r.pay;
      totalInt += r.interest;
    });
    const payoff = new Date();
    payoff.setMonth(payoff.getMonth() + months);
    return { price, down, rate, years, months, principal, rows, totalPaid, totalInt, payoff, monthly: rows[0]?.pay ?? 0 };
  }, [note]);

  /* ---- offer calc ---- */
  const of = useMemo(() => {
    const emv = toNum(offer.emv);
    const o = toNum(offer.offer);
    const p = emv > 0 ? o / emv : 0;
    // 33% and 50% themselves belong to the lower band
    const hit = emv > 0 && o > 0 ? OFFER_BANDS.find((b) => p > b.lo && p <= b.hi) ?? null : null;
    return { emv, offer: o, pct: p, hit };
  }, [offer]);

  /* ---- actions ---- */
  const sendLikelyToOffer = () => {
    if (!(comp.likely > 0)) return;
    setOffer((s) => ({ ...s, emv: String(Math.round(comp.likely)) }));
    setTab("offer");
    window.scrollTo(0, 0);
  };
  const noteCsv = () => {
    if (!nt.rows.length) return;
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines: (string | number)[][] = [["Payment #", "Payment", "Principal", "Interest", "Balance"]];
    nt.rows.forEach((r) => lines.push([r.n, r.pay.toFixed(2), r.prin.toFixed(2), r.interest.toFixed(2), r.bal.toFixed(2)]));
    const csv = lines
      .map((r) => r.map(q).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "seller-financing-schedule.csv";
    a.click();
  };
  const noteCopy = async () => {
    if (!nt.rows.length) return;
    const txt = `Seller financing: ${money(nt.price)} price, ${money(nt.down)} down, ${money(nt.principal)} financed at ${pct(nt.rate, 2)} over ${num(nt.years, 2)} years = ${money(nt.monthly, true)}/mo for ${nt.rows.length} months (total interest ${money(nt.totalInt)}).`;
    try {
      await navigator.clipboard.writeText(txt);
      alert("Summary copied.");
    } catch {
      window.prompt("Copy this:", txt);
    }
  };

  /* ---- render ---- */
  const shownRows = showAll ? nt.rows : nt.rows.slice(0, 12);
  let yrPrin = 0,
    yrInt = 0;

  const Band = ({ hit, rng, pill, what, why, mark }: { hit: boolean; rng: string; pill: { cls: string; label: string }; what: string; why: string; mark?: string }) => (
    <div className={`grid grid-cols-1 gap-x-3 gap-y-1 rounded-xl bg-slate-50 p-3 ring-1 sm:grid-cols-[140px_1fr] ${hit ? "ring-2 ring-brand-gold" : "ring-slate-200 dark:ring-slate-700"} dark:bg-slate-800`}>
      <span className="text-lg font-extrabold tabular-nums text-slate-900 sm:row-span-2 dark:text-slate-100">{rng}</span>
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
        <span className={`mr-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${PILL[pill.cls]}`}>{pill.label}</span> {what}
      </span>
      <span className="text-xs leading-snug text-slate-500 sm:col-start-2 dark:text-slate-400">{why}</span>
      {mark && <span className="text-xs font-bold text-amber-600 sm:col-start-2">{mark}</span>}
    </div>
  );

  return (
    <div>
      <nav className="mb-4 flex flex-wrap gap-2" role="tablist">
        {(
          [
            ["comp", "🏷️ Land Comps & Value"],
            ["note", "💵 Seller-Financing Note"],
            ["offer", "🎯 Offer Calculator"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? "bg-brand-gold text-brand-navy" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"}`}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </nav>

      {/* ================= COMPS ================= */}
      {tab === "comp" && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
          <div className={cardCls}>
            <Field label="Your property's acreage" value={acres} onChange={setAcres} suffix="ac" step="0.01" />
            <h3 className="mt-2 text-[15px] font-bold text-slate-800 dark:text-slate-100">Comps — 3 to 6 similar parcels that sold nearby</h3>
            <p className={noteCls}>Sold (not just listed) land of similar size and zoning, as close as you can get. Zillow, Land.com, DirectREI or Land Portal.</p>
            <div className={`grid grid-cols-[24px_1.4fr_1fr_0.8fr] items-center gap-2 ${labelCls}`}>
              <span></span><span>Sale price</span><span>Acres</span><span>Adjust</span>
            </div>
            {comps.map((r, i) => (
              <div className="grid grid-cols-[24px_1.4fr_1fr_0.8fr] items-center gap-2" key={i}>
                <span className="text-center text-[13px] text-slate-400">{i + 1}</span>
                <span className={wrapCls}><span className={affixCls}>$</span><input type="number" inputMode="decimal" value={r.price} onChange={(e) => setComp(i, "price", e.target.value)} className={innerInputCls} /></span>
                <span className={wrapCls}><input type="number" inputMode="decimal" step="0.01" value={r.acres} onChange={(e) => setComp(i, "acres", e.target.value)} className={innerInputCls} /><span className={affixCls}>ac</span></span>
                <span className={wrapCls}><input type="number" inputMode="decimal" step="1" value={r.adj} onChange={(e) => setComp(i, "adj", e.target.value)} className={innerInputCls} /><span className={affixCls}>%</span></span>
              </div>
            ))}
            <p className={noteCls}>Adjust makes a comp match your land: <b>+10</b> if yours is better (road access, power, views), <b>−15</b> if yours is worse (landlocked, wet, odd shape). Leave 0 when they&apos;re alike.</p>
            <div className="flex flex-wrap gap-2">
              <button className={btnCls} onClick={() => { setAcres(COMP_DEFAULT.acres); setComps(COMP_DEFAULT.rows); }}>Reset</button>
              <button className={btnCls} onClick={() => setComps(COMP_DEFAULT.rows.map(() => ({ price: "", acres: "", adj: "" })))}>Clear comps</button>
            </div>
          </div>

          <div className={cardCls}>
            {comp.warn && <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-200">⚠️ {comp.warn}</div>}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <Kpi n={comp.ok ? money(comp.med * comp.ac) : "—"} l="Estimated value (median $/acre)" />
              <Kpi n={comp.ok ? money(comp.med) : "—"} l="Median $/acre" />
              <Kpi n={comp.ok ? money(comp.avg) : "—"} l="Average $/acre" />
              <Kpi n={String(comp.rows.length)} l="Comps used" />
            </div>
            {comp.ok && (
              <div className="flex flex-col gap-2">
                {[
                  { cls: "green", what: "Conservative", ppa: comp.lo, why: "Priced at your lowest adjusted comp. Use this when you're setting an offer or need a fast sale." },
                  { cls: "orange", what: "Likely", ppa: comp.med, why: "The median comp — the middle of the pack, not pulled around by one odd sale. Your working EMV." },
                  { cls: "blue", what: "Aggressive", ppa: comp.hi, why: "Your highest adjusted comp. A ceiling for a patient seller-financed listing, not an offer basis." },
                ].map((b) => (
                  <Band
                    key={b.what}
                    hit={b.what === "Likely"}
                    rng={money(b.ppa * comp.ac)}
                    pill={{ cls: b.cls, label: b.what }}
                    what={`${money(b.ppa)} / acre × ${num(comp.ac, 2)} ac`}
                    why={b.why}
                  />
                ))}
              </div>
            )}
            {comp.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead><tr><th className={thCls}>Comp</th><th className={thCls}>Sale price</th><th className={thCls}>Acres</th><th className={thCls}>$ / acre</th><th className={thCls}>Adjust</th><th className={thCls}>Adjusted $ / acre</th></tr></thead>
                  <tbody>
                    {comp.rows.map((r) => (
                      <tr key={r.n}>
                        <td className={tdCls}>#{r.n}</td><td className={tdCls}>{money(r.price)}</td><td className={tdCls}>{num(r.acres, 2)}</td><td className={tdCls}>{money(r.ppa)}</td>
                        <td className={`${tdCls} text-slate-400`}>{r.adj ? (r.adj > 0 ? "+" : "") + num(r.adj, 1) + "%" : "—"}</td>
                        <td className={tdCls}><b>{money(r.adjPpa)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={noteCls}>Enter at least one comp&apos;s sale price and acreage to start.</p>
            )}
            {comp.ok && comp.rows.length >= 3 && (
              <button className={primaryBtnCls} onClick={sendLikelyToOffer}>Use the likely value as EMV in the Offer Calculator →</button>
            )}
            <p className={noteCls}>Price per acre is not linear: small lots sell for far more per acre than big tracts, so comp against parcels close to your size. With only a handful of comps, the range is the low and high comp — the more (and closer) comps you add, the tighter it gets.</p>
          </div>
        </section>
      )}

      {/* ================= NOTE ================= */}
      {tab === "note" && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
          <div className={cardCls}>
            <Field label="Sale price" value={note.price} onChange={(v) => setNote((s) => ({ ...s, price: v }))} prefix="$" />
            <Field label="Down payment" value={note.down} onChange={(v) => setNote((s) => ({ ...s, down: v }))} prefix="$" />
            <Field label="Interest rate (per year)" value={note.rate} onChange={(v) => setNote((s) => ({ ...s, rate: v }))} suffix="%" step="0.1" />
            <Field label="Term" value={note.years} onChange={(v) => setNote((s) => ({ ...s, years: v }))} suffix="years" />
            <div className="flex flex-wrap gap-2">
              <button className={btnCls} onClick={() => { setNote(NOTE_DEFAULT); setShowAll(false); }}>Reset to defaults</button>
              <button className={btnCls} onClick={noteCopy}>📋 Copy summary</button>
              <button className={btnCls} onClick={noteCsv}>⭳ Export schedule (CSV)</button>
            </div>
            <p className={noteCls}>Interest is calculated monthly on the remaining balance (standard amortization). The buyer pays you directly each month.</p>
          </div>

          <div className={cardCls}>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
              <Kpi n={money(nt.monthly, true)} l="Monthly payment" />
              <Kpi n={money(nt.principal)} l="Amount financed" />
              <Kpi n={money(nt.totalInt)} l="Total interest earned" />
              <Kpi n={money(nt.down + nt.totalPaid)} l="Total you collect" />
              <Kpi n={nt.months ? num(nt.months) + " payments" : "—"} l={nt.months ? "Paid off " + nt.payoff.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "Enter a term"} />
            </div>
            {nt.rows.length ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <thead><tr><th className={thCls}>#</th><th className={thCls}>Payment</th><th className={thCls}>Principal</th><th className={thCls}>Interest</th><th className={thCls}>Balance</th></tr></thead>
                    <tbody>
                      {shownRows.map((r, i) => {
                        yrPrin += r.prin;
                        yrInt += r.interest;
                        const yearEnd = r.n % 12 === 0 || i === shownRows.length - 1;
                        const out = [
                          <tr key={r.n}><td className={tdCls}>{r.n}</td><td className={tdCls}>{money(r.pay, true)}</td><td className={tdCls}>{money(r.prin, true)}</td><td className={tdCls}>{money(r.interest, true)}</td><td className={tdCls}>{money(r.bal, true)}</td></tr>,
                        ];
                        if (yearEnd) {
                          out.push(
                            <tr className="bg-slate-50 font-bold text-slate-500 dark:bg-slate-800" key={"y" + r.n}>
                              <td className={tdCls}>Year {Math.ceil(r.n / 12)}{r.n % 12 ? " (partial)" : ""}</td><td className={tdCls}></td>
                              <td className={tdCls}>{money(yrPrin, true)}</td><td className={tdCls}>{money(yrInt, true)}</td><td className={tdCls}>{money(r.bal, true)}</td>
                            </tr>
                          );
                          yrPrin = 0;
                          yrInt = 0;
                        }
                        return out;
                      })}
                    </tbody>
                  </table>
                </div>
                {nt.rows.length > 12 && (
                  <button className={btnCls} onClick={() => setShowAll((s) => !s)}>{showAll ? "Show first 12 only" : `Show all ${nt.rows.length} payments`}</button>
                )}
              </>
            ) : (
              <p className={noteCls}>Enter a price above the down payment and a term to see the schedule.</p>
            )}
          </div>
        </section>
      )}

      {/* ================= OFFER ================= */}
      {tab === "offer" && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
          <div className={cardCls}>
            <Field label="Estimated market value (EMV)" value={offer.emv} onChange={(v) => setOffer((s) => ({ ...s, emv: v }))} prefix="$" />
            <Field label="Seller's price or your offer" value={offer.offer} onChange={(v) => setOffer((s) => ({ ...s, offer: v }))} prefix="$" />
            <div className="flex flex-wrap gap-2">
              <button className={btnCls} onClick={() => setOffer(OFFER_DEFAULT)}>Reset</button>
            </div>
            <p className={noteCls}>The offer price isn&apos;t a single percentage — the price the seller will accept decides which structure the deal gets. Comp it first: the ladder is only as good as your EMV.</p>
          </div>

          <div className={cardCls}>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <Kpi n={of.emv ? money(of.emv / 3) : "—"} l="Buy / JV ceiling (⅓ of EMV)" />
              <Kpi n={of.emv ? money(of.emv / 2) : "—"} l="JV ceiling (½ of EMV)" />
              <Kpi n={of.offer && of.emv ? pct(of.pct * 100) : "—"} l="Your offer as % of EMV" />
              <Kpi n={of.hit ? of.hit.what.split(" — ")[0] : of.emv && of.offer ? "—" : "Enter EMV"} l={of.hit ? "Structure for this price" : ""} />
            </div>
            <div className="flex flex-col gap-2">
              {OFFER_BANDS.map((b) => {
                const rng = !of.emv
                  ? "—"
                  : b.hi === Infinity
                  ? "over " + money(of.emv * b.lo)
                  : b.lo
                  ? money(of.emv * b.lo) + " – " + money(of.emv * b.hi)
                  : "under " + money(of.emv * b.hi);
                const hit = of.hit === b;
                return (
                  <Band
                    key={b.label}
                    hit={hit}
                    rng={rng}
                    pill={{ cls: b.cls, label: `${b.label} of EMV` }}
                    what={b.what}
                    why={b.why}
                    mark={hit ? `▲ Your ${money(of.offer)} lands here` : undefined}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      <AcreRef />
    </div>
  );
}
