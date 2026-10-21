"use client";
// 📣 Per-deal marketing SOP checklist (Jon 2026-10-20) — every dispo deal gets the
// same active + passive channel list so it's always marketed correctly.
import { toggleDispoMarketingAction } from "@/app/crm/actions";
import { MARKETING_STEPS } from "@/lib/dispo-marketing";

export default function DispoMarketingChecklist({ oppId, done }: { oppId: string; done: string[] }) {
  const doneSet = new Set(done);
  const total = MARKETING_STEPS.length;
  const n = MARKETING_STEPS.filter((s) => doneSet.has(s.key)).length;
  const groups: { group: "active" | "passive"; label: string }[] = [
    { group: "active", label: "📞 Active outreach — Sharyn (calls / emails / texts)" },
    { group: "passive", label: "📰 Posting & listing — Marie (the platforms)" },
  ];
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">📣 Marketing checklist</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${n === total ? "bg-emerald-100 text-emerald-700" : n > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{n}/{total} done</span>
      </div>
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.group}>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{g.label}</div>
            <div className="space-y-1">
              {MARKETING_STEPS.filter((s) => s.group === g.group).map((s) => {
                const isDone = doneSet.has(s.key);
                return (
                  <form key={s.key} action={toggleDispoMarketingAction}>
                    <input type="hidden" name="oppId" value={oppId} /><input type="hidden" name="step" value={s.key} />
                    <button className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left ring-1 ${isDone ? "bg-emerald-50 ring-emerald-100" : "bg-slate-50 ring-slate-100 hover:bg-slate-100"}`}>
                      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded ${isDone ? "bg-emerald-600 text-white" : "bg-white ring-1 ring-slate-300"}`}>{isDone ? "✓" : ""}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[12px] font-semibold ${isDone ? "text-slate-500 line-through" : "text-slate-800"}`}>{s.label}</span>
                        {s.hint && !isDone && <span className="block text-[10px] text-slate-400">{s.hint}</span>}
                      </span>
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
