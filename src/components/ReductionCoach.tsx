"use client";
// 🔻 Reduction coach (Jon 2026-10-09): enter the deal's real numbers + what
// buyers actually said → it computes the ask and writes the seller script,
// rookie-proof. Nothing is saved — it's a working calculator.
import { useState } from "react";

const inputCls = "w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm";
const lbl = "mb-0.5 block text-[11px] font-bold text-slate-500";

const UW_LABEL: Record<string, string> = { cash: "💵 Cash MAO", novation: "📝 Novation MAO", creative: "🎨 Creative MAO", listing: "🏷 Listing", flip: "🔨 Flip", developer: "🚧 Developer" };

export default function ReductionCoach({ initial, uw = [] }: { initial?: { address?: string; contractPrice?: string }; uw?: Array<{ tab: string; mao: number; fee: number }> } = {}) {
  const [f, setF] = useState({ address: initial?.address ?? "", contractPrice: initial?.contractPrice ?? "", bestOffer: "", fee: "10,000", agentPct: "3", sellerClosing: "2,000", agreed: "", offers: "", dom: "", repairs: "", feedback: "" });
  // dummy-proof wizard (Jon 2026-10-09): BOTH choices start empty so nobody
  // runs the math on the wrong deal type by accident — the numbers only
  // appear after step 1 + step 2 are picked.
  const [dealType, setDealType] = useState<"assignment" | "novation" | null>(null);
  // 🌲 land vs house: same calculator, the AI swaps hats — GC walk-through
  // for houses, land due-diligence pricing for vacant land.
  const [propType, setPropType] = useState<"house" | "land" | null>(null);
  const setupDone = dealType !== null && propType !== null;
  // seller closing costs: exact $ when known, or % of sale price when not (Jon 2026-10-09)
  const [closingMode, setClosingMode] = useState<"$" | "%">("$");
  const [ai, setAi] = useState<{ busy: boolean; script: string; err: string; estimates: Array<{ item: string; pro: string; low: number; high: number }> }>({ busy: false, script: "", err: "", estimates: [] });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;

  const contract = num(f.contractPrice);
  const best = num(f.bestOffer); // assignment: buyer's offer to US · novation: end-buyer sale price
  const fee = num(f.fee);        // our minimum fee — never goes to zero
  const agentPct = num(f.agentPct);
  const sellerClosing = num(f.sellerClosing);
  const offers = num(f.offers);
  const dom = num(f.dom);
  // 💰 deal-type math (Jon 2026-10-09):
  //  ASSIGNMENT — buyer covers ALL closing costs: seller ≤ buyerOffer − ourFee.
  //  NOVATION  — WE cover the seller's closing costs and agent fees come out
  //  of the sale: seller ≤ salePrice − agentFees − sellerClosingCosts − ourFee.
  const agentFees = dealType === "novation" ? Math.round((best * agentPct) / 100) : 0;
  const coveredClosing = dealType === "novation" ? (closingMode === "%" ? Math.round((best * sellerClosing) / 100) : sellerClosing) : 0;
  const settle = best && fee ? best - fee - agentFees - coveredClosing : 0; // seller's ceiling (our walk-away floor)
  // 💵 our net at any seller price P: everything left after the deal's real costs
  const netAt = (p: number) => best - p - agentFees - coveredClosing;
  const agreed = num(f.agreed);
  const gap = contract && settle ? contract - settle : 0; // how far the seller must come down
  // open the ask ~15% PAST the target so there's room to "meet in the middle"
  const askReduction = gap > 0 ? Math.round((gap * 1.15) / 500) * 500 : 0;
  const target = contract && askReduction ? contract - askReduction : 0;
  const ready = offers >= 3;

  const repairLines = f.repairs.split("\n").map((r) => r.trim()).filter(Boolean);
  const money = (n: number) => `$${n.toLocaleString()}`;

  const script = contract && best ? `Hi — it's about ${f.address || "the property"}. I wanted to give you a straight update, because you deserve the truth, not silence.

We've now run the property past ${offers || "several"} of our funding partners${dom ? ` over the ${dom} days it's been on the market` : ""}. Every single one of them came back in the same range — and every one of them flagged the same things:
${repairLines.length ? repairLines.map((r) => `  • ${r}`).join("\n") : "  • the issues their walk-throughs turned up"}
${f.feedback.trim() ? `\nIn one partner's own words: "${f.feedback.trim().slice(0, 200)}"` : ""}

Here's the honest picture of the market right now: material costs are up, rates are still high, and our partners are pricing every one of those items into what they'll fund. The property has also already been exposed to the market${dom ? ` for ${dom} days` : ""} — everyone who was going to pay more has already looked.

For this to actually close, the number that works is ${money(settle)}${dealType === "novation" ? " — and remember, we're covering your closing costs, so that's what you actually walk away with" : ""}. I'd like to adjust our agreement to ${money(target)} — that gives me just enough room to push our partners up and still get you to the closing table instead of starting over.

I know that's not the number we both hoped for. But this is real money, partners who are ready to fund, and a closing that actually happens. What would you like to do?` : "";

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
          <div>
            <div className={`text-[11px] font-extrabold uppercase tracking-wide ${dealType ? "text-emerald-600" : "text-red-500"}`}>{dealType ? "✅" : "1️⃣"} Step 1 — how is this deal structured?</div>
            <div className="mt-1 flex gap-1.5">
              {([["assignment", "📄 Assignment — buyer covers ALL closing costs"], ["novation", "🏷 Novation — WE cover seller closing + agent fees"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setDealType(k)} className={`flex-1 rounded-xl px-2 py-2 text-[11px] font-bold ring-1 ${dealType === k ? "bg-brand-navy text-white ring-brand-navy" : dealType === null ? "bg-white text-slate-600 ring-red-200 hover:bg-slate-50" : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <div className={`text-[11px] font-extrabold uppercase tracking-wide ${propType ? "text-emerald-600" : "text-red-500"}`}>{propType ? "✅" : "2️⃣"} Step 2 — what are we selling?</div>
            <div className="mt-1 flex gap-1.5">
              {([["land", "🌲 Vacant land — issues priced as due-diligence costs (easements, tortoises, scrub jays, wetlands, access)"], ["house", "🏠 House — issues priced as GC repair quotes"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setPropType(k)} className={`flex-1 rounded-xl px-2 py-1.5 text-[10px] font-bold ring-1 ${propType === k ? "bg-emerald-700 text-white ring-emerald-700" : propType === null ? "bg-white text-slate-500 ring-red-200 hover:bg-slate-50" : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100"}`}>{l}</button>
              ))}
            </div>
          </div>
          {!setupDone && <div className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-bold text-slate-400 ring-1 ring-slate-100">👆 Make both choices above — the numbers unlock once you do.</div>}
          {setupDone && <>
          <div className="pt-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">3️⃣ Step 3 — the real numbers</div>
          <label><span className={lbl}>Property address</span><input value={f.address} onChange={set("address")} placeholder="123 Main St" className={inputCls} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label><span className={lbl}>Our contract price with the SELLER $</span><input value={f.contractPrice} onChange={set("contractPrice")} placeholder="80,000" className={inputCls} /></label>
            <label><span className={lbl}>{dealType === "assignment" ? "Best BUYER offer to US $" : "End-buyer SALE price $"}</span><input value={f.bestOffer} onChange={set("bestOffer")} placeholder="70,000" className={inputCls} /></label>
            <label><span className={lbl}>Our minimum fee $ <span className="font-normal text-slate-400">(we never work for free)</span></span><input value={f.fee} onChange={set("fee")} className={inputCls} /></label>
            {dealType === "novation" && <label><span className={lbl}>Agent fees %</span><input value={f.agentPct} onChange={set("agentPct")} className={inputCls} /></label>}
            {dealType === "novation" && (
              <label>
                <span className={lbl}>Seller closing costs WE cover
                  <span className="float-right inline-flex overflow-hidden rounded-md ring-1 ring-slate-200">
                    {(["$", "%"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => { setClosingMode(m); setF({ ...f, sellerClosing: m === "%" ? "2" : "2,000" }); }} className={`px-2 py-0.5 text-[10px] font-extrabold ${closingMode === m ? "bg-brand-navy text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>{m}</button>
                    ))}
                  </span>
                </span>
                <input value={f.sellerClosing} onChange={set("sellerClosing")} className={inputCls} placeholder={closingMode === "%" ? "2" : "2,000"} />
                {closingMode === "%" && best > 0 && <span className="text-[10px] font-bold text-slate-400">{sellerClosing}% of {money(best)} = {money(coveredClosing)}</span>}
              </label>
            )}
            <label><span className={lbl}># of offers received</span><input value={f.offers} onChange={set("offers")} placeholder="3" className={inputCls} /></label>
            <label><span className={lbl}>Days on market</span><input value={f.dom} onChange={set("dom")} placeholder="34" className={inputCls} /></label>
          </div>
          <label><span className={lbl}>What buyers flagged (rough bullets — one per line; on the call we say &quot;our funding partners,&quot; and the AI writes it that way)</span><textarea value={f.repairs} onChange={set("repairs")} rows={3} placeholder={propType === "land" ? "easement across the back\ngopher tortoises\nscrub jay area\nhalf of it looks wet" : "roof bad\nac old\ncrack in foundation"} className={inputCls} /></label>
          <label><span className={lbl}>Strongest buyer quote — the most powerful thing a buyer actually SAID, word-for-word <span className="font-normal text-slate-400">(optional — you repeat it to the seller as third-party proof; a real buyer&apos;s words always beat yours)</span></span><textarea value={f.feedback} onChange={set("feedback")} rows={2} placeholder={propType === "land" ? "between the easement and the tortoises, I can't go past 30" : "with that roof, I'm at 60 — not a dollar more"} className={inputCls} /></label>
          {contract > 0 && best > 0 && settle > 0 && (
            <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
              {/* 🎯 the only 3 numbers the rep needs on the call */}
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <div className="bg-indigo-50/70 p-3.5 text-center">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-500">🎯 Say this number</div>
                  <div className="mt-0.5 text-2xl font-extrabold text-indigo-800">{money(target)}</div>
                  <div className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-400">say it once, then go silent</div>
                </div>
                <div className="bg-emerald-50/70 p-3.5 text-center">
                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-600">🤝 Take any counter up to</div>
                  <div className="mt-0.5 text-2xl font-extrabold text-emerald-700">{money(settle)}</div>
                  <div className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-400">above this = manager approval first</div>
                </div>
              </div>
              {/* 💵 one live money line instead of a wall of rows */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-3 py-2.5 text-sm">
                <span className="font-bold text-slate-600">If they agree at $</span>
                <input value={f.agreed} onChange={set("agreed")} placeholder={String(target || 40000).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm font-bold" />
                <b className={`ml-auto ${agreed > 0 ? (netAt(agreed) >= fee ? "text-emerald-700" : netAt(agreed) > 0 ? "text-amber-600" : "text-red-600") : "text-slate-300"}`}>
                  {agreed > 0 ? `we make ${money(netAt(agreed))}` : `at ${money(target)} we make ${money(netAt(target))}`}
                </b>
              </div>
              {agreed > 0 && netAt(agreed) < fee && netAt(agreed) > 0 && <div className="bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700">⚠️ That&apos;s under our {money(fee)} minimum — counter higher or get manager approval.</div>}
              {agreed > 0 && netAt(agreed) <= 0 && <div className="bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600">🛑 We&apos;d LOSE money at that number.</div>}
              {/* 🏷 novation flip-side (Jon 2026-10-09): what the MARKET must
                  deliver — the list price we need and the lowest on-market
                  offer we can accept and still clear the minimum fee. */}
              {dealType === "novation" && (() => {
                const a = agentPct / 100;
                const c = closingMode === "%" ? sellerClosing / 100 : 0;
                const denom = 1 - a - c;
                if (denom <= 0.05) return null;
                const minSale = (p: number) => Math.ceil((p + fee + (closingMode === "%" ? 0 : sellerClosing)) / denom / 100) * 100;
                const listAt = (p: number) => Math.ceil(minSale(p) / 0.95 / 100) * 100;
                return (
                  <div className="space-y-1 border-t border-slate-100 bg-sky-50/60 px-3 py-2.5 text-[12px]">
                    <div className="text-[10px] font-extrabold uppercase tracking-wide text-sky-700">🏷 On the market — what it takes to still clear our {money(fee)} minimum</div>
                    <div className="flex items-baseline justify-between gap-2"><span className="text-slate-600">If seller stays at {money(contract)} → list at <b className="text-slate-800">{money(listAt(contract))}</b></span><span className="shrink-0 font-extrabold text-sky-800">lowest offer we can take: {money(minSale(contract))}</span></div>
                    {target > 0 && target < contract && (
                      <div className="flex items-baseline justify-between gap-2"><span className="text-slate-600">If they sign at {money(target)} → list at <b className="text-slate-800">{money(listAt(target))}</b></span><span className="shrink-0 font-extrabold text-emerald-700">lowest offer we can take: {money(minSale(target))}</span></div>
                    )}
                    <div className="text-[9px] font-semibold text-slate-400">list price assumes offers come in ~95% of list — an on-market offer below the &quot;lowest&quot; number means we make less than {money(fee)}</div>
                  </div>
                );
              })()}
              {/* 📐 the full breakdown, out of the way until wanted */}
              <details className="border-t border-slate-100 bg-slate-50/60">
                <summary className="cursor-pointer px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-400 hover:text-slate-600">📐 see the full math</summary>
                <div className="space-y-1 px-3 pb-3 text-[13px]">
                  <div className="flex justify-between"><span className="text-slate-500">{dealType === "assignment" ? "Our funding partner pays us (covers their own closing)" : "End-buyer sale price"}</span><b>{money(best)}</b></div>
                  {dealType === "novation" && <div className="flex justify-between"><span className="text-slate-500">− agent fees ({agentPct}%)</span><b className="text-amber-700">{money(agentFees)}</b></div>}
                  {dealType === "novation" && <div className="flex justify-between"><span className="text-slate-500">− seller closing costs (we cover)</span><b className="text-amber-700">{money(coveredClosing)}</b></div>}
                  <div className="flex justify-between"><span className="text-slate-500">− our minimum fee</span><b className="text-indigo-700">{money(fee)}</b></div>
                  <div className="flex justify-between border-t border-slate-200 pt-1"><span className="font-bold text-slate-700">= the most the seller can get</span><b className="text-emerald-700">{money(settle)}</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">We open {money(target)} (~15% past it) so there&apos;s room to meet in the middle</span><b className="text-red-600">seller comes down {money(gap)}</b></div>
                  <div className="flex justify-between"><span className="text-slate-500">At today&apos;s contract ({money(contract)}) this deal nets us</span><b className={netAt(contract) >= 0 ? "text-emerald-700" : "text-red-600"}>{money(netAt(contract))}</b></div>
                </div>
              </details>
            </div>
          )}
          {contract > 0 && best > 0 && settle <= 0 && (
            <div className="rounded-xl bg-red-50 p-3 text-[12px] font-bold text-red-600 ring-1 ring-red-100">⚠️ After {dealType === "novation" ? "agent fees + closing costs + " : ""}our fee there&apos;s nothing left — this needs a better offer from our partners, not a reduction.</div>
          )}
          </>}
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-2">
            <div className="text-sm font-extrabold text-slate-800">4️⃣ Your script — read it, don&apos;t wing it</div>
            <button
              type="button"
              disabled={ai.busy || !setupDone || !contract || !best || settle <= 0}
              onClick={async () => {
                setAi({ busy: true, script: "", err: "", estimates: [] });
                try {
                  const r = await fetch("/api/reduction/script", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dealType, propType, address: f.address, contract, best, fee, agentFees, coveredClosing, offers, dom, repairs: f.repairs, feedback: f.feedback, settle, target }),
                  });
                  const j = (await r.json()) as { script?: string; estimates?: Array<{ item: string; pro: string; low: number; high: number }>; error?: string };
                  if (j.script) setAi({ busy: false, script: j.script, err: "", estimates: j.estimates ?? [] });
                  else setAi({ busy: false, script: "", err: j.error ?? "AI didn't answer — the draft below still works", estimates: [] });
                } catch { setAi({ busy: false, script: "", err: "AI unreachable — the draft below still works", estimates: [] }); }
              }}
              className="ml-auto rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-40"
            >{ai.busy ? "✨ writing…" : "✨ Write it for me (AI)"}</button>
          </div>
          {ai.err && <p className="text-[11px] font-bold text-amber-600">{ai.err}</p>}
          {ai.estimates.length > 0 && (
            <div className="rounded-xl bg-amber-50/70 p-3 ring-1 ring-amber-200">
              <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-800">{propType === "land" ? "🌲 Land due-diligence costs — quote these numbers to the seller" : "🔨 GC walk-through estimate — quote these numbers to the seller"}</div>
              <div className="space-y-1.5">
                {ai.estimates.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 leading-snug"><b className="text-slate-800">{e.item}</b> <span className="text-slate-500">— {e.pro}</span></span>
                    <span className="shrink-0 font-extrabold tabular-nums text-slate-900">{money(e.low)}–{money(e.high)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-amber-200/70 pt-1.5 text-[12px] font-extrabold"><span className="text-amber-900">Total {propType === "land" ? "costs our partners are pricing in" : "repairs our partners are pricing in"}</span><span className="text-red-600">{money(ai.estimates.reduce((n, e) => n + e.low, 0))}–{money(ai.estimates.reduce((n, e) => n + e.high, 0))}</span></div>
              </div>
              <p className="mt-1.5 text-[10px] text-amber-700">{propType === "land" ? "Realistic permit, mitigation and site-work costs — say them as ranges (“the tortoise relocation alone is a three-to-fifteen-thousand-dollar process”) and you’ll sound like the due-diligence reports are on your desk." : "Realistic national-average installed costs — say them as ranges (“the roof alone is a twelve-to-fifteen-thousand-dollar job”) and you’ll sound like the contractor walked it with you."}</p>
            </div>
          )}
          {ai.script && (
            <div className="rounded-xl bg-violet-50 p-3 ring-1 ring-violet-200">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wide text-violet-700">✨ AI script — professional wording from your bullets
                <button type="button" onClick={() => { navigator.clipboard.writeText(ai.script).catch(() => {}); }} className="ml-auto rounded bg-white px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100">copy</button>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-800">{ai.script}</pre>
            </div>
          )}
          {script && !ai.script ? (
            <details open={!ai.busy}>
              <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-wide text-slate-400">📝 instant draft (hit ✨ above for the professional version)</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-[13px] leading-relaxed text-slate-700 ring-1 ring-slate-100">{script}</pre>
            </details>
          ) : !ai.script ? (
            <p className="text-xs text-slate-400">{setupDone ? "Fill in the contract price and the best offer — the script writes itself from your real numbers." : "Do steps 1–3 on the left first — the script writes itself from your real numbers."}</p>
          ) : null}
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-100">
            <div className="font-extrabold">🎓 First-timer rules</div>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li><b>Say &quot;funding partners,&quot; never &quot;buyers.&quot;</b> The seller must feel WE&apos;re in the deal and our partners fund it — &quot;buyers&quot; tells them we&apos;re not the one buying, and the reduction dies.</li>
              <li><b>Facts, not apologies.</b> You&apos;re the messenger of what our FUNDING PARTNERS found — never make it your opinion of their property.</li>
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
