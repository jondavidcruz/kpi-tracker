"use client";

import { useMemo, useState } from "react";

// Lead ROI calculator — how marketing spend turns into closed deals.
// Same idea as the insurance lead-ROI calculators, rebuilt for wholesaling:
// spend → leads → contacts → offers → contracts → closings, with the cost of
// each stage and the ROI on the month. All client-side; presets are editable.

const money = (n: number) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : "—");
const num = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const lbl = "block text-[11px] font-semibold text-slate-500 mb-0.5";

// Channel presets — typical numbers to start from; every field stays editable.
const PRESETS: Record<string, { spend: string; leads: string; contact: string; offer: string; contract: string; close: string; note: string }> = {
  "PPL (pay-per-lead)": { spend: "6,000", leads: "80", contact: "85", offer: "30", contract: "12", close: "70", note: "Warm inbound — high contact rate, pricier per lead." },
  "Direct mail": { spend: "3,000", leads: "45", contact: "95", offer: "35", contract: "15", close: "75", note: "~5,000 letters at ~$0.60 → ~1% response. Sellers call YOU." },
  "Cold calling": { spend: "2,500", leads: "60", contact: "100", offer: "20", contract: "8", close: "65", note: "VA dialer cost. 'Leads' = real conversations with owners." },
  "SMS (when A2P clears)": { spend: "1,500", leads: "50", contact: "100", offer: "18", contract: "8", close: "65", note: "Cheap volume, colder intent — scrub first (see Phone Health SOP)." },
};

export default function LeadRoiCalculator() {
  const [f, setF] = useState({ spend: "6,000", leads: "80", contact: "85", offer: "30", contract: "12", close: "70", fee: "15,000" });
  const [preset, setPreset] = useState("PPL (pay-per-lead)");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const applyPreset = (name: string) => {
    setPreset(name);
    const p = PRESETS[name];
    if (p) setF((prev) => ({ ...prev, spend: p.spend, leads: p.leads, contact: p.contact, offer: p.offer, contract: p.contract, close: p.close }));
  };

  const r = useMemo(() => {
    const spend = num(f.spend), leads = num(f.leads), fee = num(f.fee);
    const contacts = leads * (num(f.contact) / 100);
    const offers = contacts * (num(f.offer) / 100);
    const contracts = offers * (num(f.contract) / 100);
    const closings = contracts * (num(f.close) / 100);
    const revenue = closings * fee;
    const profit = revenue - spend;
    const roi = spend > 0 ? (profit / spend) * 100 : 0;
    const per = (n: number) => (n > 0 ? spend / n : 0);
    const breakEven = fee > 0 ? spend / fee : 0;
    return { spend, leads, fee, contacts, offers, contracts, closings, revenue, profit, roi, breakEven,
      cpl: per(leads), cpContact: per(contacts), cpOffer: per(offers), cpContract: per(contracts), cpClose: per(closings) };
  }, [f]);

  const stages: { emoji: string; label: string; count: number; cost: number; pctLabel?: string }[] = [
    { emoji: "📥", label: "Leads", count: r.leads, cost: r.cpl },
    { emoji: "☎️", label: "Contacts", count: r.contacts, cost: r.cpContact, pctLabel: `${f.contact}% reached` },
    { emoji: "📝", label: "Offers", count: r.offers, cost: r.cpOffer, pctLabel: `${f.offer}% of contacts` },
    { emoji: "✍️", label: "Contracts", count: r.contracts, cost: r.cpContract, pctLabel: `${f.contract}% of offers` },
    { emoji: "🏆", label: "Closings", count: r.closings, cost: r.cpClose, pctLabel: `${f.close}% close` },
  ];
  const maxCount = Math.max(1, r.leads);
  const fmtCount = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1));
  const good = r.roi >= 100, ok = r.roi >= 0;

  return (
    <div className="space-y-4">
      {/* Channel presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Start from a channel:</span>
        {Object.keys(PRESETS).map((name) => (
          <button key={name} type="button" onClick={() => applyPreset(name)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${preset === name ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
            {name}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-[11px] italic text-slate-400">{PRESETS[preset]?.note}</p>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Inputs */}
        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Your numbers (monthly)</div>
          <label><span className={lbl}>💸 Marketing spend / month</span><input value={f.spend} onChange={set("spend")} className={inputCls} /></label>
          <label><span className={lbl}>📥 Leads / month</span><input value={f.leads} onChange={set("leads")} className={inputCls} /></label>
          <div className="grid grid-cols-2 gap-2.5">
            <label><span className={lbl}>☎️ Lead → contact %</span><input value={f.contact} onChange={set("contact")} className={inputCls} /></label>
            <label><span className={lbl}>📝 Contact → offer %</span><input value={f.offer} onChange={set("offer")} className={inputCls} /></label>
            <label><span className={lbl}>✍️ Offer → contract %</span><input value={f.contract} onChange={set("contract")} className={inputCls} /></label>
            <label><span className={lbl}>🏆 Contract → close %</span><input value={f.close} onChange={set("close")} className={inputCls} /></label>
          </div>
          <label><span className={lbl}>💰 Avg assignment fee</span><input value={f.fee} onChange={set("fee")} className={inputCls} /></label>
        </div>

        {/* Funnel + verdict */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">The funnel — what each stage costs you</div>
            <div className="space-y-2">
              {stages.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[12px] font-bold text-slate-600 dark:text-slate-300">{s.emoji} {s.label}</span>
                  <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                    <div className="flex h-full items-center rounded-lg bg-gradient-to-r from-brand-navy to-[#28527a] pl-2.5" style={{ width: `${Math.max(7, (s.count / maxCount) * 100)}%` }}>
                      <span className="text-[12px] font-extrabold text-white tabular-nums">{fmtCount(s.count)}</span>
                    </div>
                    {s.pctLabel && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400">{s.pctLabel}</span>}
                  </div>
                  <span className="w-28 shrink-0 text-right text-[12px] font-bold tabular-nums text-slate-600 dark:text-slate-300">{s.cost > 0 ? `${money(s.cost)} each` : "—"}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Verdict tiles */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-xl border-2 border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-900">
              <div className="text-[10.5px] font-bold uppercase text-slate-400">Cost / closed deal</div>
              <div className="text-xl font-extrabold tabular-nums text-slate-800 dark:text-slate-100">{money(r.cpClose)}</div>
            </div>
            <div className="rounded-xl border-2 border-slate-200 bg-white p-3 text-center dark:border-slate-700 dark:bg-slate-900">
              <div className="text-[10.5px] font-bold uppercase text-slate-400">Revenue / month</div>
              <div className="text-xl font-extrabold tabular-nums text-slate-800 dark:text-slate-100">{money(r.revenue)}</div>
            </div>
            <div className={`rounded-xl border-2 p-3 text-center ${ok ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"}`}>
              <div className="text-[10.5px] font-bold uppercase text-slate-400">Profit / month</div>
              <div className={`text-xl font-extrabold tabular-nums ${ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600"}`}>{money(r.profit)}</div>
            </div>
            <div className={`rounded-xl border-2 p-3 text-center ${good ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" : ok ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"}`}>
              <div className="text-[10.5px] font-bold uppercase text-slate-400">ROI</div>
              <div className={`text-xl font-extrabold tabular-nums ${good ? "text-emerald-700 dark:text-emerald-300" : ok ? "text-amber-700 dark:text-amber-300" : "text-red-600"}`}>{r.roi >= 0 ? "+" : ""}{Math.round(r.roi)}%</div>
            </div>
          </div>

          {/* Coach line */}
          <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${good ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : ok ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>
            {r.closings > 0 && r.spend > 0 ? (
              good
                ? `💪 Every $1 in returns $${(r.revenue / r.spend).toFixed(2)}. Break-even is just ${r.breakEven.toFixed(1)} deal${r.breakEven > 1 ? "s" : ""} — this channel scales.`
                : ok
                  ? `⚖️ Profitable but thin: ${r.breakEven.toFixed(1)} deals to break even vs ${r.closings.toFixed(1)} projected. Push the contact or offer rate up, or the lead cost down.`
                  : `🚨 This loses ${money(-r.profit)}/mo — you need ${r.breakEven.toFixed(1)} closings to break even but project ${r.closings.toFixed(1)}. Fix the funnel before spending more.`
            ) : "Enter spend, leads, and rates to see the verdict."}
          </div>
        </div>
      </div>
    </div>
  );
}
