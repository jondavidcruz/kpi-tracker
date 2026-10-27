"use client";
// 📇 Per-deal buyer-agent + developer follow-up tracker (Jon 2026-10-20).
// Lives on each dispo deal (right panel of the opp card). Shows the follow-up
// SEQUENCE as a strip, lists everyone we've sent this deal to, and makes the
// next-follow-up + "what they'll pay" one tap each — so the biggest hurdle (the
// follow-up) is never dropped and every buyer is tied to its deal.
import { useState } from "react";
import Link from "next/link";
import { addDispoBuyerAction, updateDispoBuyerAction, logDispoBuyerTouchAction, removeDispoBuyerAction, addDispoOfferAction } from "@/app/crm/actions";
import { DISPO_BUYER_STAGES, DISPO_BUYER_KINDS, stageMeta, type DispoBuyer } from "@/lib/dispo-buyers";
import AttachBuyerPanel from "@/components/AttachBuyerPanel";

export default function DispoBuyerTracker({ oppId, buyers, today, dealArea = "", canCall = false, canSms = false, board = false }: { oppId: string; buyers: DispoBuyer[]; today: string; dealArea?: string; canCall?: boolean; canSms?: boolean; board?: boolean }) {
  const [adding, setAdding] = useState(false);
  const [offerFor, setOfferFor] = useState<string | null>(null); // entryId whose quick-offer form is open
  const counts = DISPO_BUYER_STAGES.map((s) => ({ ...s, n: buyers.filter((b) => b.stage === s.key).length }));
  const dueCount = buyers.filter((b) => b.nextFollowUp && b.nextFollowUp <= today && b.stage !== "passed" && b.stage !== "offer_in").length;

  // one buyer card — rendered grouped by stage below (Jon 2026-10-26: kanban-style + scroll)
  const card = (b: DispoBuyer) => {
    const overdue = b.nextFollowUp && b.nextFollowUp <= today && b.stage !== "passed" && b.stage !== "offer_in";
    const km = DISPO_BUYER_KINDS.find((k) => k.key === b.kind);
    return (
      <div key={b.id} className={`rounded-lg px-2 py-1.5 ring-1 ${overdue ? "bg-red-50 ring-red-200" : "bg-white ring-slate-200"}`}>
        <div className="flex items-start gap-1.5">
          <span className="text-[13px] leading-none" title={km?.label}>{km?.emoji}</span>
          <div className="min-w-0 flex-1">
            {b.buyerId
              ? <Link href={`/crm/${b.buyerId}`} className="block truncate text-[12px] font-bold text-sky-700 hover:underline" title="Open this buyer in the network CRM">{b.name}</Link>
              : <div className="truncate text-[12px] font-bold text-slate-800">{b.name}</div>}
            {(b.phone || b.email) && <div className="truncate text-[10px] font-semibold text-slate-400">{b.phone}{b.phone && b.email ? " · " : ""}{b.email}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {canCall && b.phone && (
              <button type="button" title={`Call ${b.name} in-app (Telnyx)`}
                onClick={() => window.dispatchEvent(new CustomEvent("fo-call", { detail: { phone: b.phone, name: b.name, oppId: b.buyerId, contactId: b.contactId } }))}
                className="grid h-6 w-6 place-items-center rounded-md bg-emerald-50 text-[11px] ring-1 ring-emerald-200 hover:bg-emerald-100">📞</button>
            )}
            {b.phone && (canSms && b.buyerId
              ? <Link href={`/crm/${b.buyerId}#sms`} title={`Text ${b.name}`} className="grid h-6 w-6 place-items-center rounded-md bg-sky-50 text-[11px] ring-1 ring-sky-200 hover:bg-sky-100">💬</Link>
              : <a href={`sms:${b.phone}`} title={`Text ${b.name}`} className="grid h-6 w-6 place-items-center rounded-md bg-sky-50 text-[11px] ring-1 ring-sky-200 hover:bg-sky-100">💬</a>)}
            {b.email && (b.buyerId
              ? <Link href={`/crm/${b.buyerId}#email`} title={`Email ${b.name}`} className="grid h-6 w-6 place-items-center rounded-md bg-amber-50 text-[11px] ring-1 ring-amber-200 hover:bg-amber-100">✉️</Link>
              : <a href={`mailto:${b.email}`} title={`Email ${b.name}`} className="grid h-6 w-6 place-items-center rounded-md bg-amber-50 text-[11px] ring-1 ring-amber-200 hover:bg-amber-100">✉️</a>)}
            {b.buyerId && <Link href={`/crm/${b.buyerId}`} title="Open this buyer's full lead card" className="grid h-6 w-6 place-items-center rounded-md bg-slate-50 text-[11px] ring-1 ring-slate-200 hover:bg-slate-100">↗</Link>}
            <form action={removeDispoBuyerAction}>
              <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={b.id} />
              <button className="grid h-6 w-6 place-items-center rounded px-1 text-[11px] text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="Remove from this deal">✕</button>
            </form>
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          <form action={updateDispoBuyerAction} className="contents">
            <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={b.id} /><input type="hidden" name="field" value="stage" />
            <select name="value" defaultValue={b.stage} onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`rounded px-1 py-0.5 text-[10px] font-bold ${stageMeta(b.stage).cls}`}>
              {DISPO_BUYER_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </form>
          <form action={updateDispoBuyerAction} className="contents">
            <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={b.id} /><input type="hidden" name="field" value="price" />
            <input name="value" defaultValue={b.price ?? ""} placeholder="💵 will pay…" onBlur={(e) => { if (e.currentTarget.value !== (b.price ?? "")) e.currentTarget.form?.requestSubmit(); }} className="w-20 rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-semibold" />
          </form>
          <form action={updateDispoBuyerAction} className="contents">
            <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={b.id} /><input type="hidden" name="field" value="nextFollowUp" />
            <input type="date" name="value" defaultValue={b.nextFollowUp ?? ""} onChange={(e) => e.currentTarget.form?.requestSubmit()} title="Next follow-up" className={`rounded border px-1 py-0.5 text-[10px] font-semibold ${overdue ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-500"}`} />
          </form>
          <form action={logDispoBuyerTouchAction} className="contents">
            <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={b.id} />
            <select name="result" defaultValue="" title="What happened on this touch?" className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-600">
              <option value="">result…</option>
              <option value="no answer">no answer</option>
              <option value="left voicemail">left voicemail</option>
              <option value="spoke — interested">spoke — interested</option>
              <option value="spoke — not interested">spoke — not interested</option>
              <option value="texted">texted</option>
              <option value="emailed">emailed</option>
              <option value="sent the packet">sent the packet</option>
              <option value="made an offer">made an offer</option>
            </select>
            <button className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-sky-700" title="Log this touch (with the result) + bump the next follow-up">📞 Log touch</button>
          </form>
          <button type="button" onClick={() => setOfferFor(offerFor === b.id ? null : b.id)} className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700" title="Log an offer this buyer made on THIS deal">💰 +offer</button>
        </div>
        {offerFor === b.id && (
          <form action={addDispoOfferAction} onSubmit={() => setOfferFor(null)} className="mt-1 flex flex-wrap items-center gap-1 rounded-lg bg-emerald-50 p-1.5 ring-1 ring-emerald-200">
            <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="buyer" value={b.name} />{b.buyerId && <input type="hidden" name="buyerId" value={b.buyerId} />}
            <span className="text-[10px] font-bold text-emerald-800">💰 {b.name.split(" ")[0]}&apos;s offer on this deal:</span>
            <input name="price" placeholder="$ price" required className="w-20 rounded border border-emerald-200 px-1 py-0.5 text-[10px] font-bold" />
            <input name="terms" placeholder="terms" className="w-20 rounded border border-emerald-200 px-1 py-0.5 text-[10px]" />
            <input name="daysToClose" placeholder="days" inputMode="numeric" className="w-12 rounded border border-emerald-200 px-1 py-0.5 text-[10px]" />
            <button className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700">Log</button>
            <button type="button" onClick={() => setOfferFor(null)} className="text-[10px] font-semibold text-slate-400">cancel</button>
          </form>
        )}
        <form action={updateDispoBuyerAction} className="mt-1">
          <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="entryId" value={b.id} /><input type="hidden" name="field" value="notes" />
          <textarea name="value" defaultValue={b.notes ?? ""} rows={2} placeholder={b.buyerId ? "📝 Notes on this agent (also saved to their lead card) — what they want, next step…" : "📝 Notes on this agent — what they said, what they want, next step…"}
            onBlur={(e) => { if (e.currentTarget.value !== (b.notes ?? "")) e.currentTarget.form?.requestSubmit(); }}
            className="w-full resize-y rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-700 placeholder:text-slate-300" />
        </form>
        {b.lastContact && <div className="mt-0.5 text-[9px] text-slate-400">last touch {b.lastContact}</div>}
      </div>
    );
  };

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">📇 Buyers &amp; agents on this deal</span>
        {dueCount > 0 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">{dueCount} follow-up due</span>}
        <span className="ml-auto text-[10px] font-semibold text-slate-400">{buyers.length}</span>
      </div>

      {/* sequence strip */}
      {buyers.length > 0 && (
        <div className="mb-2 flex items-stretch gap-1">
          {counts.map((s) => (
            <div key={s.key} className={`flex-1 rounded-md px-1 py-1 text-center ${s.cls}`} title={s.label}>
              <div className="text-[13px] font-extrabold leading-none tabular-nums">{s.n}</div>
              <div className="mt-0.5 text-[7.5px] font-bold uppercase leading-tight">{s.label.replace(/^[^ ]+ /, "")}</div>
            </div>
          ))}
        </div>
      )}

      {/* rows — grouped by stage (kanban-style), in a capped SCROLL area so a deal with
          lots of attached agents doesn't make the page endless (Jon 2026-10-26) */}
      {buyers.length === 0
        ? <p className="py-1 text-[11px] text-slate-400">No buyers yet. Add the developers + buyer agents you send this deal to, then work the follow-ups.</p>
        : board ? (
          // 🗂 TRUE kanban — stages as side-by-side columns (full-width placement, Jon 2026-10-26)
          <div className="flex gap-3 overflow-x-auto pb-2">
            {DISPO_BUYER_STAGES.map((s) => {
              const group = buyers.filter((b) => b.stage === s.key);
              return (
                <div key={s.key} className="flex w-72 shrink-0 flex-col rounded-lg bg-slate-50/60 p-1.5 ring-1 ring-slate-100">
                  <div className={`mb-1.5 flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${s.cls}`}>
                    {s.label} <span className="rounded-full bg-white/70 px-1.5 text-[9px] tabular-nums">{group.length}</span>
                  </div>
                  <div className="max-h-[32rem] space-y-1.5 overflow-y-auto">
                    {group.length === 0 ? <p className="px-1 py-2 text-[10px] text-slate-300">—</p> : group.map((b) => card(b))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="max-h-[44rem] space-y-2 overflow-y-auto rounded-lg bg-slate-50/50 p-1.5 ring-1 ring-slate-100">
            {DISPO_BUYER_STAGES.map((s) => {
              const group = buyers.filter((b) => b.stage === s.key);
              if (group.length === 0) return null;
              return (
                <div key={s.key}>
                  <div className={`sticky top-0 z-10 mb-1 flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] font-extrabold uppercase tracking-wide shadow-sm ${s.cls}`}>
                    {s.label} <span className="rounded-full bg-white/70 px-1.5 text-[9px] tabular-nums">{group.length}</span>
                  </div>
                  <div className="space-y-1.5">{group.map((b) => card(b))}</div>
                </div>
              );
            })}
          </div>
        )}

      {/* 🔗 attach from the buyer-network CRM (the integration) */}
      <AttachBuyerPanel oppId={oppId} defaultQuery={dealArea} attachedIds={buyers.map((b) => b.buyerId).filter((x): x is string => !!x)} />

      {/* add a one-off by hand */}
      {adding ? (
        <form action={addDispoBuyerAction} className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200" onSubmit={() => setAdding(false)}>
          <input type="hidden" name="oppId" value={oppId} />
          <div className="flex gap-1">
            <input name="name" placeholder="Name / company *" required className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
            <select name="kind" className="rounded border border-slate-300 px-1 py-1 text-[11px] font-semibold">
              {DISPO_BUYER_KINDS.map((k) => <option key={k.key} value={k.key}>{k.emoji} {k.key === "buyer_agent" ? "Agent" : "Developer"}</option>)}
            </select>
          </div>
          <div className="flex gap-1">
            <input name="phone" placeholder="Phone" className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
            <input name="price" placeholder="💵 will pay" className="w-24 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
          </div>
          <div className="flex gap-1">
            <button className="flex-1 rounded bg-brand-navy px-2 py-1 text-[11px] font-bold text-white hover:bg-brand-navy-700">Add to deal</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600">Cancel</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-[11px] font-bold text-slate-500 hover:border-brand-navy hover:text-brand-navy">+ Add buyer / agent to this deal</button>
      )}
    </div>
  );
}
