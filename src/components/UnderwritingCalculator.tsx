"use client";

import { useState } from "react";

const TABS = [
  { key: "assignment", label: "Assignment", emoji: "🤝", blurb: "Cash offer. MAO = (ARV × market %) − repairs − flipper holding − your fee. Anchor opens below MAO." },
  { key: "novation", label: "Novation", emoji: "📋", blurb: "List at current similar-condition value, cover the seller's closing + commission (no holding — retail buyer). Find the max seller payout." },
  { key: "creative", label: "Creative", emoji: "🔑", blurb: "Seller-finance or Subject-to. We assign the terms to an end buyer and collect an assignment fee." },
  { key: "listing", label: "Listing", emoji: "🏷️", blurb: "Traditional listing with our agent. We collect a referral / marketing fee." },
] as const;

const MARKET_TIERS: [string, string][] = [
  ["80", "Highly Competitive Urban — 80%"],
  ["75", "Strong Suburban / Metro — 75%"],
  ["70", "Mid-Tier Cities — 70%"],
  ["65", "Rural Markets — 65%"],
  ["60", "Extremely Rural — 60%"],
];
const REHAB_LEVELS: [string, string][] = [
  ["", "— pick condition —"],
  ["17", "Cleanup (~$17/sf)"],
  ["22", "Lipstick (~$22/sf)"],
  ["30", "Interior (~$30/sf)"],
  ["35", "Full (~$35/sf)"],
  ["45", "Full + 2 big items (~$45/sf)"],
  ["55", "Full + 4 big items (~$55/sf)"],
  ["65", "Full + 6 big items (~$65/sf)"],
  ["75", "Full gut (~$75/sf)"],
];

function num(v: string): number {
  const n = Number((v || "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
const money = (n: number) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : "—");
const esc = (s: string) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-200";

export default function UnderwritingCalculator() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("assignment");
  const [f, setF] = useState<Record<string, string>>({});
  const v = (k: string) => f[k] ?? "";
  const n = (k: string) => num(v(k));
  const setV = (k: string, val: string) => setF((p) => ({ ...p, [k]: val }));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV(k, e.target.value);

  function Field({ k, label, prefix, suffix, placeholder, span }: { k: string; label: string; prefix?: string; suffix?: string; placeholder?: string; span?: number }) {
    return (
      <label className={span === 2 ? "sm:col-span-2" : span === 3 ? "sm:col-span-3" : ""}>
        <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">{label}</span>
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>}
          <input inputMode={suffix || prefix ? "decimal" : "text"} value={v(k)} onChange={set(k)} placeholder={placeholder} className={`${inputCls} ${prefix ? "pl-6" : ""} ${suffix ? "pr-8" : ""}`} />
          {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>}
        </div>
      </label>
    );
  }
  function Res({ label, value, tone = "navy", big }: { label: string; value: string; tone?: "navy" | "good" | "bad" | "muted"; big?: boolean }) {
    const cls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : tone === "muted" ? "text-slate-500" : "text-brand-navy";
    return (
      <div className="flex items-baseline justify-between gap-3 py-1.5">
        <span className="text-sm text-slate-600">{label}</span>
        <span className={`font-extrabold tabular-nums ${big ? "text-2xl" : "text-base"} ${cls}`}>{value}</span>
      </div>
    );
  }

  // ---- Assignment ----
  const marketPct = v("marketPct") || "70";
  const arv = n("arv"), aFee = n("aFee");
  const sqft = n("sqft"), rehabSf = num(v("rehabSf"));
  const repairsCalc = sqft * rehabSf;
  const repairs = n("repairs") || repairsCalc;
  const holding = n("aHoldMonths") * n("aMonthlyCarry");
  const flipperTarget = arv * (num(marketPct) / 100);
  const cashMao = flipperTarget - repairs - holding - aFee;
  const aAnchorPct = v("aAnchorPct") || "10";
  const aAnchor = cashMao * (1 - num(aAnchorPct) / 100);

  // ---- Novation ----
  const novCompPrices = [n("nComp1p"), n("nComp2p"), n("nComp3p")].filter((x) => x > 0);
  const suggestedList = novCompPrices.length ? Math.min(...novCompPrices) : 0; // conservative → sells fastest
  const nList = n("nList"), nComm = num(v("nComm") || "5"), nSellerClose = n("nSellerClose"), nMinFee = n("nMinFee"), nRepairCredit = n("nRepairCredit");
  const nNet = nList - nRepairCredit - nList * (nComm / 100) - nSellerClose;
  const novMao = nNet - nMinFee;
  const nAnchorPct = v("nAnchorPct") || "7";
  const novAnchor = novMao * (1 - num(nAnchorPct) / 100);
  const feeAtAnchor = nNet - novAnchor;

  // ---- Creative / Listing ----
  const cFee = n("cFee");
  const lList = n("lList"), lComm = num(v("lComm") || "2.5"), lRef = num(v("lRef") || "25"), lFlat = n("lFlat");
  const mktFee = lFlat > 0 ? lFlat : lList * (lComm / 100) * (lRef / 100);

  function buildReport(): { title: string; rows: [string, string][]; comps?: string; note?: string } {
    const addr = v("subject") || "—";
    if (tab === "assignment") {
      const comps = [1, 2, 3].map((i) => { const a = v(`comp${i}`); const p = v(`comp${i}p`); const d = v(`comp${i}d`); return a ? `${esc(a)}${p ? ` — $${esc(p)}` : ""}${d ? `, ${esc(d)} DOM` : ""}` : ""; }).filter(Boolean).join("<br>");
      return {
        title: "Assignment (Cash) Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}${comps ? `<br><strong>ARV comps (price · days on market):</strong><br>${comps}` : ""}`,
        rows: [["ARV", money(arv)], [`Market tier (${marketPct}% of ARV)`, money(flipperTarget)], ["Repairs", money(repairs)], ["Flipper holding cost", money(holding)], ["Assignment fee", money(aFee)], ["Cash MAO (max offer to seller)", money(cashMao)], [`Anchor / opening offer (${aAnchorPct}% below MAO)`, money(aAnchor)], ["Negotiation range", `${money(aAnchor)} → ${money(cashMao)}`]],
        note: "Open at the anchor, negotiate up to the cash MAO. Holding accounts for the flipper's carry. If the seller won't meet MAO, pivot to Novation.",
      };
    }
    if (tab === "novation") {
      const comps = [1, 2, 3].map((i) => { const a = v(`nComp${i}`); const p = v(`nComp${i}p`); const d = v(`nComp${i}d`); return a ? `${esc(a)} — ${p ? "$" + esc(p) : "?"}${d ? `, ${esc(d)} DOM` : ""}` : ""; }).filter(Boolean).join("<br>");
      return {
        title: "Novation Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}${comps ? `<br><strong>As-is comps (price · days on market):</strong><br>${comps}` : ""}`,
        rows: [["List price (current similar-condition)", money(nList)], ["Buyer repair credit", money(nRepairCredit)], [`Agent commission (${nComm}%)`, money(nList * (nComm / 100))], ["Seller closing costs (we cover)", money(nSellerClose)], ["Net after costs", money(nNet)], ["Our minimum fee", money(nMinFee)], ["Novation MAO (max seller payout)", money(novMao)], [`Anchor / opening payout (${nAnchorPct}% below MAO)`, money(novAnchor)], ["Negotiation range (seller payout)", `${money(novAnchor)} → ${money(novMao)}`], ["Our fee at anchor", money(feeAtAnchor)]],
        note: "No holding costs (retail buyer). List conservatively to sell under 90 days. Disclose we market higher to make it work.",
      };
    }
    if (tab === "creative") {
      const type = v("cType") || "Seller finance";
      const rows: [string, string][] = [["Structure", type]];
      if (type === "Subject-to") { rows.push(["Loan balance assumed", money(n("cLoan"))], ["Monthly payment (PITI)", money(n("cPmt"))]); }
      else { rows.push(["Agreed price", money(n("cPrice"))], ["Down to seller", money(n("cDown"))], ["Monthly to seller", money(n("cPmt"))], ["Term", v("cTerm") || "—"]); }
      rows.push(["Our assignment fee (to end buyer)", money(cFee)]);
      return { title: "Creative (Seller-finance / Subject-to) Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}`, rows, note: "We assign these terms to an end buyer who wants them and collect the assignment fee." };
    }
    return {
      title: "Listing Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}`,
      rows: [["List price", money(lList)], [`Listing commission (${lComm}%)`, money(lList * (lComm / 100))], lFlat > 0 ? ["Flat marketing fee", money(lFlat)] : [`Referral / marketing fee (${lRef}% of commission)`, money(mktFee)], ["Our marketing fee", money(mktFee)]],
      note: "Standard agent-to-agent referral is 25% of the listing-side commission. A flat $2,500–$5,000 is also common — set whichever you use.",
    };
  }

  function exportPdf() {
    const r = buildReport();
    const w = window.open("", "_blank", "width=820,height=920");
    if (!w) return;
    const rows = r.rows.map(([l, val], i) => `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"}"><td style="padding:7px 12px;color:#475569">${esc(l)}</td><td style="padding:7px 12px;font-weight:700;text-align:right">${esc(val)}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title></head>
      <body style="font-family:system-ui,Arial,sans-serif;color:#0f172a;max-width:720px;margin:28px auto;padding:0 18px">
        <div style="border-bottom:3px solid #0b1f3a;padding-bottom:8px;margin-bottom:14px">
          <div style="font-weight:800;font-size:18px;color:#0b1f3a">Freedom Offers — War Room</div>
          <div style="color:#64748b;font-size:13px">${esc(r.title)} · ${new Date().toLocaleDateString()}</div>
        </div>
        ${r.comps ? `<div style="margin-bottom:14px;color:#334155;line-height:1.5">${r.comps}</div>` : ""}
        <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
        ${r.note ? `<p style="margin-top:16px;color:#64748b;font-size:12px;font-style:italic">${esc(r.note)}</p>` : ""}
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }

  const sectionCls = "sm:col-span-2 mt-1 border-t border-slate-100 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">📍 Subject property address</span>
          <input value={v("subject")} onChange={set("subject")} placeholder="123 Main St, San Diego, CA 92101" className={inputCls} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{t.emoji} {t.label}</button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{TABS.find((t) => t.key === tab)!.blurb}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Inputs */}
        <div className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2">
          {tab === "assignment" && (
            <>
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Market tier (% of ARV the flipper supports)</span>
                <select value={marketPct} onChange={set("marketPct")} className={inputCls}>{MARKET_TIERS.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
              </label>
              <Field k="arv" label="ARV" prefix="$" placeholder="350,000" />
              <Field k="aFee" label="Assignment fee" prefix="$" placeholder="15,000" />
              <div className={sectionCls}>Repairs — type a figure, or estimate from sqft</div>
              <Field k="repairs" label="Repair estimate ($) — overrides sqft calc" prefix="$" span={2} />
              <Field k="sqft" label="Square feet" />
              <label><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Condition ($/sf)</span>
                <select value={v("rehabSf")} onChange={set("rehabSf")} className={inputCls}>{REHAB_LEVELS.map(([val, l]) => <option key={val || "x"} value={val}>{l}</option>)}</select>
              </label>
              <div className={sectionCls}>Flipper holding (their money cost)</div>
              <Field k="aHoldMonths" label="Months held" placeholder="6" />
              <Field k="aMonthlyCarry" label="Monthly carry (taxes, ins, loan…)" prefix="$" placeholder="1,000" />
              <Field k="aAnchorPct" label="Anchor below MAO" suffix="%" placeholder="10" />
              <div className={sectionCls}>ARV comps (addr · sold $ · days on market)</div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <Field k={`comp${i}`} label={`Comp ${i} address`} span={2} />
                  <Field k={`comp${i}p`} label="Sold $" prefix="$" />
                  <Field k={`comp${i}d`} label="DOM" />
                </div>
              ))}
            </>
          )}
          {tab === "novation" && (
            <>
              <div className="sm:col-span-2 flex items-end gap-2">
                <div className="flex-1"><Field k="nList" label="List price (current similar-condition value)" prefix="$" placeholder="420,000" /></div>
                {suggestedList > 0 && (
                  <button type="button" onClick={() => setV("nList", String(suggestedList))} className="mb-0.5 shrink-0 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-200" title="Lowest comp — most conservative to sell under 90 days">Use {money(suggestedList)}</button>
                )}
              </div>
              <Field k="nRepairCredit" label="Buyer repair credit" prefix="$" />
              <Field k="nComm" label="Agent commission" suffix="%" placeholder="5" />
              <Field k="nSellerClose" label="Seller closing (we cover)" prefix="$" placeholder="6,000" />
              <Field k="nMinFee" label="Our minimum fee" prefix="$" placeholder="15,000" />
              <Field k="nAnchorPct" label="Anchor below MAO" suffix="%" placeholder="7" />
              <div className={sectionCls}>As-is comparables — match condition (addr · sold $ · days on market)</div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <Field k={`nComp${i}`} label={`Comp ${i} address`} span={2} />
                  <Field k={`nComp${i}p`} label="Sold $" prefix="$" />
                  <Field k={`nComp${i}d`} label="DOM" />
                </div>
              ))}
            </>
          )}
          {tab === "creative" && (
            <>
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Structure</span>
                <select value={v("cType") || "Seller finance"} onChange={set("cType")} className={inputCls}><option>Seller finance</option><option>Subject-to</option></select>
              </label>
              {(v("cType") || "Seller finance") === "Subject-to" ? (
                <>
                  <Field k="cLoan" label="Loan balance assumed" prefix="$" />
                  <Field k="cPmt" label="Monthly payment (PITI)" prefix="$" />
                </>
              ) : (
                <>
                  <Field k="cPrice" label="Agreed price" prefix="$" />
                  <Field k="cDown" label="Down to seller" prefix="$" />
                  <Field k="cPmt" label="Monthly to seller" prefix="$" />
                  <Field k="cTerm" label="Term (e.g. 60 mo / balloon 5yr)" />
                </>
              )}
              <Field k="cFee" label="Our assignment fee (to end buyer)" prefix="$" span={2} placeholder="15,000" />
            </>
          )}
          {tab === "listing" && (
            <>
              <Field k="lList" label="List price" prefix="$" span={2} />
              <Field k="lComm" label="Listing-side commission" suffix="%" placeholder="2.5" />
              <Field k="lRef" label="Referral fee (% of commission)" suffix="%" placeholder="25" />
              <Field k="lFlat" label="…or flat marketing fee (overrides)" prefix="$" span={2} placeholder="2,500" />
            </>
          )}
        </div>

        {/* Results */}
        <div className="rounded-2xl bg-gradient-to-b from-slate-50 to-white p-4 ring-1 ring-slate-200">
          {tab === "assignment" && (
            <>
              <Res label={`Flipper resale target (${marketPct}% of ARV)`} value={money(flipperTarget)} tone="muted" />
              <Res label="− Repairs" value={money(repairs)} tone="muted" />
              {holding > 0 && <Res label="− Flipper holding" value={money(holding)} tone="muted" />}
              <Res label="− Assignment fee" value={money(aFee)} tone="muted" />
              <Res label="🎯 Cash MAO (max offer to seller)" value={money(cashMao)} tone={cashMao > 0 ? "navy" : "bad"} big />
              <Res label="⚓ Anchor (open here)" value={money(aAnchor)} tone="good" />
              <Res label="Negotiate" value={`${money(aAnchor)} → ${money(cashMao)}`} tone="muted" />
            </>
          )}
          {tab === "novation" && (
            <>
              <Res label="Net after credit + commission + seller closing" value={money(nNet)} tone="muted" />
              <Res label="🎯 Novation MAO (max seller payout)" value={money(novMao)} tone={novMao > 0 ? "navy" : "bad"} big />
              <Res label="⚓ Anchor payout (open here)" value={money(novAnchor)} tone="good" />
              <Res label="Our fee at anchor" value={money(feeAtAnchor)} tone="good" />
              <Res label="Negotiate (seller payout)" value={`${money(novAnchor)} → ${money(novMao)}`} tone="muted" />
            </>
          )}
          {tab === "creative" && (
            <>
              <Res label="Structure" value={v("cType") || "Seller finance"} tone="muted" />
              <Res label="🎯 Our assignment fee" value={money(cFee)} tone={cFee > 0 ? "good" : "muted"} big />
              <p className="mt-2 text-[11px] text-slate-400">We assign these terms to an end buyer who wants them — we collect the fee, the buyer takes over the terms.</p>
            </>
          )}
          {tab === "listing" && (
            <>
              <Res label="Listing commission" value={money(lList * (lComm / 100))} tone="muted" />
              <Res label="🎯 Our marketing / referral fee" value={money(mktFee)} tone={mktFee > 0 ? "good" : "muted"} big />
              <p className="mt-2 text-[11px] text-slate-400">Typical: 25% of the listing-side commission (industry-standard referral), or a flat $2,500–$5,000.</p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={exportPdf} className="rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-navy hover:opacity-90">📄 Export PDF (for the CRM)</button>
        <span className="text-[11px] text-slate-400">Opens a clean report — choose “Save as PDF”, then upload to REI Reply.</span>
      </div>
      <p className="text-[11px] text-slate-400">Estimates only — confirm comps, repair scope, and title before making an offer. Next up: Wholetail, Flip, and Luxury assignment tabs.</p>
    </div>
  );
}
