import { db } from "@/lib/db";
import { getOnboardingStore, buildMilestones } from "@/lib/onboarding-progress";

// 🎓 A new hire's OWN onboarding progress, shown at the top of their dashboard
// (Jon 2026-10-16: "allow the new reps to see what else they need to accomplish").
// Read-only for the rep — the same milestones the owner tracks on /team-roster,
// so they always know what's done and what's left. The owner checks off the
// training milestones; the rep just sees the live status.
export default async function OnboardingProgressCard({
  userId, name, position,
}: { userId: string; name: string; position?: string | null }) {
  const first = name.trim().split(/\s+/)[0] || "there";
  const [store, assessments, docCount] = await Promise.all([
    getOnboardingStore(),
    db.assessment.findMany({ where: { OR: [{ userId }, { name: { equals: name, mode: "insensitive" } }] }, select: { workStylesResult: true, wordSurveyResult: true } }).catch(() => []),
    db.teamDoc.count({ where: { userId } }).catch(() => 0),
  ]);
  const entry = store[userId] ?? {};
  const assessmentDone = assessments.some((a) => !!a.workStylesResult || !!a.wordSurveyResult);
  const milestones = buildMilestones({
    position,
    welcomeSentAt: entry.welcomeSentAt,
    assessmentDone,
    hasAgreement: docCount > 0,
    certified: false, // if they can see this card they're still onboarding
    manual: entry.steps ?? {},
  });
  const done = milestones.filter((m) => m.done).length;
  const total = milestones.length;
  const pct = Math.round((done / total) * 100);
  const remaining = milestones.filter((m) => !m.done);

  return (
    <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-extrabold text-slate-800">🎓 Your onboarding — welcome, {first}!</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[12px] font-bold ${pct === 100 ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>{done}/{total} done · {pct}%</span>
      </div>
      <div className="mt-1 text-[13px] text-slate-500">Here&apos;s everything to finish before you&apos;re certified for full access. Your manager checks these off as you go — reach out when you&apos;ve completed one.</div>
      <div className="my-3 h-2.5 w-full overflow-hidden rounded-full bg-sky-100">
        <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${pct}%` }} />
      </div>

      {remaining.length > 0 && (
        <div className="mb-3 rounded-xl bg-white p-3 ring-1 ring-sky-100">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-600">⏭️ Still to do ({remaining.length})</div>
          <ul className="space-y-1">
            {remaining.map((m) => (
              <li key={m.key} className="flex items-start gap-2 text-[13px] text-slate-700"><span className="mt-0.5 text-slate-300">☐</span><span>{m.label}</span></li>
            ))}
          </ul>
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-[12px] font-semibold text-slate-500 hover:text-slate-700">Show everything ({done} done ✓)</summary>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {milestones.map((m) => (
            <div key={m.key} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] ${m.done ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-500"}`}>
              <span>{m.done ? "✅" : "☐"}</span><span className="flex-1">{m.label}</span>
            </div>
          ))}
        </div>
      </details>
      {pct === 100 && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800 ring-1 ring-emerald-200">🎉 Everything&apos;s done — you&apos;re ready to be certified! Your manager will unlock full access.</div>}
    </div>
  );
}
