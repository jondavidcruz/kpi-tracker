"use client";
// 🔻 Reduction coach (Jon 2026-10-09): enter the deal's real numbers + what
// buyers actually said → it computes the ask and writes the seller script,
// rookie-proof. Nothing is saved — it's a working calculator.
import { useState } from "react";

const inputCls = "w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm";
const lbl = "mb-0.5 block text-[11px] font-bold text-slate-500";

const UW_LABEL: Record<string, string> = { cash: "💵 Cash MAO", novation: "📝 Novation MAO", creative: "🎨 Creative MAO", listing: "🏷 Listing", flip: "🔨 Flip", developer: "🚧 Developer" };

export default function ReductionCoach({ initial, uw = [] }: { initial?: { address?: string; contractPrice?: string }; uw?: Array<{ tab: string; mao: number; fee: number }> } = {}) {
  const [f, setF] = useState({ address: initial?.address ?? "", contractPrice: initial?.contractPrice ?? "", bestOffer: "", fee: "10,000", offers: "", dom: "", repairs: "", feedback: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;

  const contract = num(f.contractPrice);
  const best = num(f.bestOffer); // what the BUYER offers US
  const fee = num(f.fee);        // our minimum assignment fee — never goes to zero
  const offers = num(f.offers);
  const dom = num(f.dom);
  // 💰 the wholesale math (Jon 2026-10-09): buyer pays us `best`; we keep
  // `fee`; so the SELLER must land at or below best − fee for this to close
  // with us still making money. Example: buyer 70k, fee 10k → seller ≤ 60k.
  const settle = best && fee ? best - fee : 0;           // seller's ceiling (our walk-away floor)
  const gap = contract && settle ? contract - settle : 0; // how far the seller must come down
  // open the ask ~15% PAST the target so there's room to "meet in the middle"
  const askReduction = gap > 0 ? Math.round((gap * 1.15) / 500) * 500 : 0;
  const target = contract && askReduction ? contract - askReduction : 0;
  const ready = offers >= 3;

  const repairLines = f.repairs.split("\n").map((r) => r.trim()).filter(Boolean);
  const money = (n: number) => `$${n.toLocaleString()}`;

  const script = contract && best ? `Hi — it's about ${f.address || "the property"}. I wanted to give you a straight update, because you deserve the truth, not silence.

We've now had ${offers || "several"} serious buyers through the property${dom ? ` over the ${dom} days it's been on the market` : ""}. Every single one of them came back in the same range — and every one of them flagged the same things:
${repairLines.length ? repairLines.map((r) => `  • ${r}`).join("\n") : "  • the repairs their contractors quoted after walking it"}
${f.feedback.trim() ? `\nIn their own words: "${f.feedback.trim().slice(0, 200)}"` : ""}

Here's the honest picture of the market right now: material costs are up, mortgage rates are still high, and buyers are pricing every repair into their offers. The property has also already been seen by the market${dom ? ` for ${dom} days` : ""} — everyone who was going to pay more has already looked.

For this to actually close, the number that works is ${money(settle)}. I'd like to adjust our agreement to ${money(target)} — that gives me just enough room to push the buyers up and still get you to the closing table instead of starting over.

I know that's not the number we both hoped for. But this is real money, from a real buyer, who can close. What would you like to do?` : "";

  return (
    <div className="space-y-4">
      {/* the rule, in lights */}
      <div className={`rounded-xl px-4 py-3 text-sm font-bold ring-1 ${ready ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-800 ring-red-200"}`}>
        {ready ? `✅ ${offers} offers in hand — you're cleared to run the reduction.` : `🛑 ${offers || 0}/3 offers — DO NOT reduce or accept yet. Push the buyer list until you have 3 real offers. Three offers = proof of the market; one offer = one person's opinion.`}
      </div>

      {uw.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50/60 px-4 py-2.5 ring-1 ring-indigo-100">
          <span className="text-[11px] font-extrabold text-indigo-900">🧮 From the underwriting calculator for this address:</span>
          {uw.map((u) => (
            <span key={u.tab} className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-indigo-100">{UW_LABEL[u.tab] ?? u.tab}: ${u.mao.toLocaleString()}</span>
          ))}
          <span className="text-[10px] text-slate-500">— any settle number at or above these keeps the deal profitable.</span>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-extrabold text-slate-800">1️⃣ The real numbers</div>
          <label><span className={lbl}>Property address</span><input value={f.address} onChange={set("address")} placeholder="123 Main St" className={inputCls} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label><span className={lbl}>Our contract price with the SELLER $</span><input value={f.contractPrice} onChange={set("contractPrice")} placeholder="80,000" className={inputCls} /></label>
            <label><span className={lbl}>Best BUYER offer to US $</span><input value={f.bestOffer} onChange={set("bestOffer")} placeholder="70,000" className={inputCls} /></label>
            <label><span className={lbl}>Our minimum fee $ <span className="font-normal text-slate-400">(we never work for free)</span></span><input value={f.fee} onChange={set("fee")} className={inputCls} /></label>
            <label><span className={lbl}># of offers received</span><input value={f.offers} onChange={set("offers")} placeholder="3" className={inputCls} /></label>
            <label><span className={lbl}>Days on market</span><input value={f.dom} onChange={set("dom")} placeholder="34" className={inputCls} /></label>
          </div>
          <label><span className={lbl}>Repairs buyers flagged (one per line — their contractors&apos; words)</span><textarea value={f.repairs} onChange={set("repairs")} rows={3} placeholder={"roof needs replacing — quoted $12k\nfoundation crack on the east side\nfull electrical update"} className={inputCls} /></label>
          <label><span className={lbl}>Strongest buyer quote (optional — gold on the call)</span><textarea value={f.feedback} onChange={set("feedback")} rows={2} placeholder={"at this price I'd need the roof done, otherwise I'm at 60"} className={inputCls} /></label>
          {contract > 0 && best > 0 && (
            <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-100">
              <div className="flex justify-between"><span className="text-slate-500">Buyer pays us</span><b>{money(best)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">− our fee (protected)</span><b className="text-indigo-700">{money(fee)}</b></div>
              <div className="flex justify-between border-t border-slate-200 pt-1"><span className="font-bold text-slate-700">Seller must land at or below</span><b className="text-emerald-700">{money(settle)}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Open the ask at</span><b>{money(target)} <span className="text-[10px] font-semibold text-slate-400">(~15% past target = room to meet in the middle)</span></b></div>
              <div className="flex justify-between"><span className="text-slate-500">Seller comes down by</span><b className="text-red-600">{money(gap)}</b></div>
              {settle <= 0 && <div className="text-[11px] font-bold text-red-600">⚠️ The buyer offer doesn&apos;t even cover the fee — this needs a bigger buyer push, not a reduction.</div>}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-extrabold text-slate-800">2️⃣ Your script — read it, don&apos;t wing it</div>
          {script ? (
            <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-[13px] leading-relaxed text-slate-700 ring-1 ring-slate-100">{script}</pre>
          ) : (
            <p className="text-xs text-slate-400">Fill in the contract price and the best offer — the script writes itself from your real numbers.</p>
          )}
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-100">
            <div className="font-extrabold">🎓 First-timer rules</div>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li><b>Facts, not apologies.</b> You&apos;re the messenger of what BUYERS said — never make it your opinion of their house.</li>
              <li><b>Say the number, then stop talking.</b> The silence after the ask is where the deal happens. Count to ten in your head.</li>
              <li><b>They say no?</b> &quot;Totally understand. Which of those repair items do you disagree with?&quot; — argue the repairs, never the person.</li>
              <li><b>They counter?</b> Anything at or above the &quot;must land&quot; number is a YES. Take it and close.</li>
              <li><b>Never threaten to cancel.</b> Instead: &quot;I want to close this for you — this is the path that actually gets you to the table.&quot;</li>
              <li><b>Follow up in writing</b> the same hour: text them the agreed number so there&apos;s no re-trade later.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
