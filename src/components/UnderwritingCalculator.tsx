"use client";

import { useState } from "react";

const TABS = [
  { key: "assignment", label: "Assignment", emoji: "🤝", blurb: "Contract low, assign to a cash buyer for a fee." },
  { key: "novation", label: "Novation", emoji: "📋", blurb: "Light fix, list retail, keep the spread above the seller's payout." },
  { key: "creative", label: "Creative", emoji: "🔑", blurb: "Seller-finance / subject-to — cashflow or resale markup." },
] as const;

function num(v: string): number {
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
const money = (n: number) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : "—");
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n)}%` : "—");

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-200";

function Field({ label, value, onChange, prefix, suffix, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">{label}</span>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>}
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputCls} ${prefix ? "pl-6" : ""} ${suffix ? "pr-8" : ""}`}
        />
        {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function Result({ label, value, tone = "navy", big }: { label: string; value: string; tone?: "navy" | "good" | "bad" | "muted"; big?: boolean }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : tone === "muted" ? "text-slate-500" : "text-brand-navy";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`font-extrabold tabular-nums ${big ? "text-2xl" : "text-base"} ${cls}`}>{value}</span>
    </div>
  );
}

export default function UnderwritingCalculator() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("assignment");

  // Shared
  const [arv, setArv] = useState("");
  const [repairs, setRepairs] = useState("");
  // Assignment
  const [buyerPct, setBuyerPct] = useState("70");
  const [fee, setFee] = useState("10000");
  // Novation
  const [listPrice, setListPrice] = useState("");
  const [commission, setCommission] = useState("6");
  const [closingPct, setClosingPct] = useState("2");
  const [holding, setHolding] = useState("3000");
  const [sellerPayout, setSellerPayout] = useState("");
  // Creative
  const [purchase, setPurchase] = useState("");
  const [down, setDown] = useState("");
  const [payment, setPayment] = useState("");
  const [rent, setRent] = useState("");
  const [resale, setResale] = useState("");

  const A = num(arv);
  const R = num(repairs);

  // Assignment
  const buyerMax = A * (num(buyerPct) / 100) - R;
  const mao = buyerMax - num(fee);
  const maoPctArv = A ? (mao / A) * 100 : NaN;

  // Novation
  const LP = num(listPrice) || A;
  const novCommission = LP * (num(commission) / 100);
  const novClosing = LP * (num(closingPct) / 100);
  const novProfit = LP - novCommission - novClosing - R - num(holding) - num(sellerPayout);
  const novMargin = LP ? (novProfit / LP) * 100 : NaN;

  // Creative
  const cashflow = num(rent) - num(payment);
  const cashToClose = num(down);
  const resaleSpread = num(resale) ? num(resale) - num(purchase) : NaN;

  return (
    <div className="space-y-4">
      {/* Shared property inputs */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2">
        <Field label="After-Repair Value (ARV)" value={arv} onChange={setArv} prefix="$" placeholder="350,000" />
        <Field label="Repair estimate" value={repairs} onChange={setRepairs} prefix="$" placeholder="40,000" />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{TABS.find((t) => t.key === tab)!.blurb}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          {tab === "assignment" && (
            <>
              <Field label="Cash buyer's target (% of ARV)" value={buyerPct} onChange={setBuyerPct} suffix="%" />
              <Field label="Your assignment fee" value={fee} onChange={setFee} prefix="$" />
            </>
          )}
          {tab === "novation" && (
            <>
              <Field label="List price (retail)" value={listPrice} onChange={setListPrice} prefix="$" placeholder={A ? String(A) : "ARV"} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Agent commission" value={commission} onChange={setCommission} suffix="%" />
                <Field label="Closing costs" value={closingPct} onChange={setClosingPct} suffix="%" />
              </div>
              <Field label="Holding costs" value={holding} onChange={setHolding} prefix="$" />
              <Field label="Seller payout (what they net)" value={sellerPayout} onChange={setSellerPayout} prefix="$" />
            </>
          )}
          {tab === "creative" && (
            <>
              <Field label="Agreed purchase price" value={purchase} onChange={setPurchase} prefix="$" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Down / entry to seller" value={down} onChange={setDown} prefix="$" />
                <Field label="Monthly payment (PITI)" value={payment} onChange={setPayment} prefix="$" />
              </div>
              <Field label="Market rent (if holding)" value={rent} onChange={setRent} prefix="$" />
              <Field label="Resale price (if reselling)" value={resale} onChange={setResale} prefix="$" />
            </>
          )}
        </div>

        {/* Results */}
        <div className="rounded-2xl bg-gradient-to-b from-slate-50 to-white p-4 ring-1 ring-slate-200">
          {tab === "assignment" && (
            <>
              <Result label="Cash buyer's max price" value={money(buyerMax)} tone="muted" />
              <Result label="🎯 Your max offer to seller (MAO)" value={money(mao)} tone={mao > 0 ? "navy" : "bad"} big />
              <Result label="Your spread (assignment fee)" value={money(num(fee))} tone="good" />
              <Result label="Offer as % of ARV" value={pct(maoPctArv)} tone="muted" />
            </>
          )}
          {tab === "novation" && (
            <>
              <Result label="Commission" value={money(novCommission)} tone="muted" />
              <Result label="Closing costs" value={money(novClosing)} tone="muted" />
              <Result label="Seller nets" value={money(num(sellerPayout))} tone="muted" />
              <Result label="🎯 Your projected profit" value={money(novProfit)} tone={novProfit > 0 ? "good" : "bad"} big />
              <Result label="Margin (% of sale)" value={pct(novMargin)} tone="muted" />
            </>
          )}
          {tab === "creative" && (
            <>
              <Result label="Cash to close (entry)" value={money(cashToClose)} tone="muted" />
              <Result label="🎯 Monthly cashflow (rent − payment)" value={money(cashflow)} tone={cashflow > 0 ? "good" : "bad"} big />
              {num(resale) > 0 && <Result label="Resale spread (resale − purchase)" value={money(resaleSpread)} tone={resaleSpread > 0 ? "good" : "bad"} />}
              <p className="mt-2 text-[11px] text-slate-400">Tip: positive cashflow for a hold; use resale spread for a wrap/flip exit.</p>
            </>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400">Estimates only — confirm comps, repair scope, and title before making an offer. Defaults are editable.</p>
    </div>
  );
}
