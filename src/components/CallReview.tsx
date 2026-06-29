"use client";

import { reviewCallScore } from "@/app/actions";

// Training-review controls on a scored call: a 1–5 star rating + a "used for training"
// flag, so the team can see at a glance which calls have already been reviewed.
export default function CallReview({ id, stars, training, canEdit }: { id: string; stars: number; training: boolean; canEdit: boolean }) {
  if (!canEdit) {
    if (!stars && !training) return null;
    return (
      <div className="mt-1 flex items-center gap-2 text-xs">
        {stars > 0 && <span className="text-amber-500" title={`${stars}/5`}>{"★".repeat(stars)}<span className="text-slate-300">{"★".repeat(5 - stars)}</span></span>}
        {training && <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">🎓 Reviewed for training</span>}
      </div>
    );
  }
  return (
    <form action={reviewCallScore} className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
      <input type="hidden" name="id" value={id} />
      <span className="text-[11px] font-semibold text-slate-400">Training review:</span>
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="submit" name="stars" value={n} title={`${n} star${n === 1 ? "" : "s"}`} className={`px-0.5 text-lg leading-none hover:scale-110 ${n <= stars ? "text-amber-500" : "text-slate-300 hover:text-amber-300"}`}>★</button>
        ))}
        {stars > 0 && <button type="submit" name="stars" value={0} title="Clear rating" className="ml-1 text-[11px] text-slate-400 hover:text-red-500">clear</button>}
      </div>
      <button type="submit" name="training" value="toggle" className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${training ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
        🎓 {training ? "Used for training ✓" : "Mark used for training"}
      </button>
    </form>
  );
}
