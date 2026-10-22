"use client";
// 💰 Offers-received tracker on a dispo deal (Jon 2026-10-22). The accountability
// companion to the buyer tracker: WHO we sent it to (DispoBuyerTracker) vs what
// came BACK here. Enforces the "minimum 3 offers" goal — price, terms, days to
// close on each — and highlights the best one. Below the "Sent to Buyers" stage a
// deal with <3 offers shows a red "keep working" flag.
import { useState } from "react";
import Link from "next/link";
import { addDispoOfferAction, updateDispoOfferAction, removeDispoOfferAction, handBestOfferToSellerAction } from "@/app/crm/actions";
import { OFFER_GOAL, OFFER_STATUSES, offerStatusMeta, offerStats, parseMoney, fmtMoney, type DispoOffer } from "@/lib/dispo-offers";

export default function DispoOffersPanel({ oppId, offers, buyerNames = [], pastCascade = false, askPrice = null }: { oppId: string; offers: DispoOffer[]; buyerNames?: string[]; pastCascade?: boolean; askPrice?: number | null }) {
  const [adding, setAdding] = useState(false);
  const st = offerStats(offers);
  const behind = pastCascade && !st.met;
  // 🤝 Best-offer → seller handoff (Jon 2026-10-24): offer the seller BELOW the best
  // buyer offer so we keep a spread. Default target spread ~20% of the best offer;
  // if we know the seller's asking, cap the offer at it (never offer MORE than asked).
  const best = st.best ?? 0;
  const defaultSpread = best > 0 ? Math.max(5000, Math.round((best * 0.2) / 500) * 500) : 0;
  const [spreadStr, setSpreadStr] = useState("");
  const spread = spreadStr.trim() ? Math.max(0, parseMoney(spreadStr) ?? 0) : defaultSpread;
  const uncapped = Math.max(0, best - spread);
  const sellerOffer = askPrice != null && askPrice > 0 ? Math.min(askPrice, uncapped) : uncapped;
  const realSpread = best - sellerOffer;
  const roi = sellerOffer > 0 ? Math.round((realSpread / sellerOffer) * 100) : 0;

  return (
    <div className={`rounded-xl bg-white p-3 ring-1 ${behind ? "ring-red-200" : "ring-slate-200"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">💰 Offers received</span>
        {/* goal progress — N of 3 */}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${st.met ? "bg-emerald-100 text-emerald-700" : behind ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{st.live} of {OFFER_GOAL} goal</span>
        <div className="flex items-center gap-0.5" title={`${st.live} live offers toward the ${OFFER_GOAL}-offer goal`}>
          {Array.from({ length: OFFER_GOAL }).map((_, i) => (
            <span key={i} className={`h-2 w-4 rounded-full ${i < st.live ? "bg-emerald-500" : "bg-slate-200"}`} />
          ))}
        </div>
        {st.best != null && <span className="ml-auto text-[10px] font-bold text-emerald-700" title={`Best live offer — ${st.bestBuyer}`}>⭐ best {fmtMoney(st.best)}</span>}
      </div>

      {behind && (
        <div className="mb-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
          🚩 This deal is out but has {st.live === 0 ? "no offers" : `only ${st.live} offer${st.live === 1 ? "" : "s"}`} — goal is {OFFER_GOAL}. Keep chasing buyers until we hit 3.
        </div>
      )}

      {/* 🤝 Best offer → seller: what to offer the seller to keep a spread */}
      {best > 0 && (
        <div className="mb-2 rounded-lg bg-indigo-50 p-2 ring-1 ring-indigo-200">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            <span className="font-extrabold text-indigo-900">🤝 Hand best offer to the seller</span>
            <span className="text-slate-500">best buyer offer <b className="text-emerald-700">{fmtMoney(best)}</b>{st.bestBuyer ? ` (${st.bestBuyer})` : ""}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-500">Target spread</span>
            <input value={spreadStr} onChange={(e) => setSpreadStr(e.target.value)} placeholder={fmtMoney(defaultSpread)} className="w-20 rounded border border-indigo-200 px-1 py-0.5 text-[11px] font-bold" />
            <span className="text-slate-400">→ offer the seller</span>
            <span className="rounded-md bg-white px-1.5 py-0.5 text-[12px] font-extrabold text-indigo-800 ring-1 ring-indigo-200">{fmtMoney(sellerOffer)}</span>
            <span className="font-bold text-emerald-700">= {fmtMoney(realSpread)} spread ({roi}% ROI)</span>
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            {askPrice != null && askPrice > 0
              ? <>Seller asked {fmtMoney(askPrice)} — offer is capped at their ask so you never overpay.</>
              : <>No seller asking price on file — this is best offer − spread. Confirm it&apos;s a number they&apos;d take.</>}
          </div>
          <form action={handBestOfferToSellerAction} className="mt-1.5">
            <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="best" value={best} /><input type="hidden" name="sellerOffer" value={sellerOffer} /><input type="hidden" name="buyer" value={st.bestBuyer} />
            <button className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700" title="Log the suggested seller offer + create a task to present it">🤝 Hand to seller side ({fmtMoney(sellerOffer)})</button>
          </form>
        </div>
      )}

      {/* header row */}
      {offers.length > 0 && (
        <div className="mb-1 grid grid-cols-[1fr_auto_auto_auto_auto] gap-1 px-1 text-[8.5px] font-bold uppercase tracking-wide text-slate-300">
          <span>Buyer</span><span>Price</span><span>Terms</span><span>Days</span><span>Status</span>
        </div>
      )}

      <div className="space-y-1">
        {offers.length === 0 && <p className="py-1 text-[11px] text-slate-400">No offers logged yet. As buyers/agents come back with a number, log it here — price, terms, days to close — and work toward {OFFER_GOAL}.</p>}
        {[...offers]
          .sort((a, b) => (parseMoney(b.price) ?? -1) - (parseMoney(a.price) ?? -1))
          .map((o) => {
            const sm = offerStatusMeta(o.status);
            const isTopLive = sm.live && st.best != null && parseMoney(o.price) === st.best;
            return (
              <div key={o.id} className={`rounded-lg px-2 py-1.5 ring-1 ${isTopLive ? "bg-emerald-50 ring-emerald-200" : "bg-slate-50 ring-slate-100"}`}>
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-1">
                  {/* buyer */}
                  <div className="min-w-0">
                    {o.buyerId
                      ? <Link href={`/crm/${o.buyerId}`} className="block truncate text-[12px] font-bold text-sky-700 hover:underline">{o.buyer}</Link>
                      : <span className="block truncate text-[12px] font-bold text-slate-800">{o.buyer}</span>}
                    {o.at && <span className="text-[9px] text-slate-400">{o.at}{o.by ? ` · ${o.by}` : ""}</span>}
                  </div>
                  {/* price */}
                  <form action={updateDispoOfferAction} className="contents">
                    <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={o.id} /><input type="hidden" name="field" value="price" />
                    <input name="value" defaultValue={o.price} placeholder="$" onBlur={(e) => { if (e.currentTarget.value !== o.price) e.currentTarget.form?.requestSubmit(); }} className="w-20 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] font-bold text-emerald-700" />
                  </form>
                  {/* terms */}
                  <form action={updateDispoOfferAction} className="contents">
                    <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={o.id} /><input type="hidden" name="field" value="terms" />
                    <input name="value" defaultValue={o.terms ?? ""} placeholder="terms" onBlur={(e) => { if (e.currentTarget.value !== (o.terms ?? "")) e.currentTarget.form?.requestSubmit(); }} className="w-20 rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px]" />
                  </form>
                  {/* days to close */}
                  <form action={updateDispoOfferAction} className="contents">
                    <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={o.id} /><input type="hidden" name="field" value="daysToClose" />
                    <input name="value" defaultValue={o.daysToClose ?? ""} placeholder="days" inputMode="numeric" onBlur={(e) => { if (e.currentTarget.value !== (o.daysToClose ?? "")) e.currentTarget.form?.requestSubmit(); }} className="w-12 rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px]" title="Days to close" />
                  </form>
                  {/* status */}
                  <form action={updateDispoOfferAction} className="contents">
                    <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={o.id} /><input type="hidden" name="field" value="status" />
                    <select name="value" defaultValue={o.status} onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`rounded px-1 py-0.5 text-[10px] font-bold ${sm.cls}`}>
                      {OFFER_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </form>
                  {/* remove */}
                  <form action={removeDispoOfferAction}>
                    <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={o.id} />
                    <button className="rounded px-1 text-[11px] text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="Remove this offer">✕</button>
                  </form>
                </div>
              </div>
            );
          })}
      </div>

      {adding ? (
        <form action={addDispoOfferAction} className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200" onSubmit={() => setAdding(false)}>
          <input type="hidden" name="oppId" value={oppId} />
          <div className="flex gap-1">
            <input name="buyer" list={`buyers-${oppId}`} placeholder="Buyer / agent name *" required className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
            <datalist id={`buyers-${oppId}`}>{buyerNames.map((n) => <option key={n} value={n} />)}</datalist>
            <input name="price" placeholder="💵 Price *" className="w-24 rounded border border-slate-300 px-1.5 py-1 text-[11px] font-semibold" />
          </div>
          <div className="flex gap-1">
            <input name="terms" placeholder="Terms (cash / assignment / novation…)" className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
            <input name="daysToClose" placeholder="Days" inputMode="numeric" className="w-16 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
          </div>
          <div className="flex gap-1">
            <button className="flex-1 rounded bg-brand-navy px-2 py-1 text-[11px] font-bold text-white hover:bg-brand-navy-700">Log offer</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-bold text-slate-500 hover:border-emerald-500 hover:text-emerald-600">+ Log an offer received</button>
      )}
    </div>
  );
}
