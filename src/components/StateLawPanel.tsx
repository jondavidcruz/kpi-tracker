import { WHOLESALE_LAW, RATING_META, type WholesaleRating } from "@/lib/wholesale-law";

// ⚖️ Wholesaling-law oversight by state — a quick friendly/caution/hard read so we don't waste pulls
// in attorney-heavy or restricted states (Jon 2026-11-11). Orientation only, not legal advice.
export default function StateLawPanel() {
  const order: WholesaleRating[] = ["friendly", "caution", "hard"];
  const groups = order.map((r) => ({ rating: r, items: WHOLESALE_LAW.filter((s) => s.rating === r) }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-[12px] text-amber-800 ring-1 ring-amber-200">
        <b>⚖️ Orientation, not legal advice.</b> A fast read on how easy each state is to wholesale in, so you can
        aim pulls at friendly ground and skip attorney-heavy / restricted states. <b>Always confirm the current
        rules with a licensed attorney in that state before working a deal</b> — laws change.
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] font-semibold">
        {order.map((r) => (
          <span key={r} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ${RATING_META[r].cls}`}>
            {RATING_META[r].dot} {RATING_META[r].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600 ring-1 ring-slate-200">⚖️ = attorney-closing state</span>
      </div>

      {groups.map(({ rating, items }) => (
        <div key={rating} className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{RATING_META[rating].dot} {RATING_META[rating].label}</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {items.map((s) => (
              <div key={s.code} className={`rounded-2xl p-4 ring-1 ${RATING_META[s.rating].cls.replace(/bg-\S+/, "bg-white")}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-black text-slate-800">{s.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${RATING_META[s.rating].cls}`}>{RATING_META[s.rating].dot} {RATING_META[s.rating].label}</span>
                  {s.attorneyState && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">⚖️ attorney state</span>}
                </div>
                <p className="mb-2 text-[12px] font-semibold text-slate-700">{s.verdict}</p>
                <dl className="space-y-1 text-[11px] text-slate-600">
                  <div><dt className="inline font-bold text-slate-500">Closing: </dt><dd className="inline">{s.closing}</dd></div>
                  <div><dt className="inline font-bold text-slate-500">Licensing: </dt><dd className="inline">{s.license}</dd></div>
                  <div><dt className="inline font-bold text-slate-500">Disclosure: </dt><dd className="inline">{s.disclosure}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="px-1 text-[11px] text-slate-400">States not listed aren&apos;t rated yet — ask and I&apos;ll add them. Attorney-closing states (⚖️) can still be worked, but they add cost and time, so aim your pulls at the 🟢 friendly states first.</p>
    </div>
  );
}
