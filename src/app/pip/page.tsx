import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { todayStr, friendlyDate } from "@/lib/date";
import { getCurrentUser, isManager } from "@/lib/auth";
import { findPipCandidates, PIP_STAGES, stageMeta, PIP_CONSECUTIVE_MISSES } from "@/lib/pip";
import { openPip, updatePip, addPipCheckin, advancePip } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const lbl = "block text-[11px] font-semibold text-slate-500 mb-0.5";

export default async function PipPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);

  const [candidates, openPips, closedPips, users] = await Promise.all([
    findPipCandidates(today),
    db.pip.findMany({ where: { status: "open" }, orderBy: { updatedAt: "desc" }, include: { user: true } }),
    db.pip.findMany({ where: { status: { not: "open" } }, orderBy: { updatedAt: "desc" }, take: 20, include: { user: true } }),
    db.user.findMany({ where: { active: true, position: { not: "" } } }),
  ]);

  return (
    <div className="space-y-7">
      <SectionTitle
        title="🎯 Performance Improvement Plans"
        subtitle="Documented, progressive accountability driven by the gap data."
        accent="bg-red-400"
      />
      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}

      {/* The ladder */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">The accountability ladder</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PIP_STAGES.map((s, i) => (
            <div key={s.key} className="rounded-xl border border-slate-200 p-3">
              <div className="text-xs font-bold text-slate-800">{s.label}</div>
              <div className="mt-1 text-xs text-slate-500">{s.blurb}</div>
              <div className={`mt-2 rounded-md px-2 py-1 text-[11px] font-semibold ${i === 3 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {s.consequence}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">Auto-flag triggers after {PIP_CONSECUTIVE_MISSES} consecutive logged working-days below goal on a KPI. Consequences are configurable per plan.</p>
      </Card>

      {/* Auto-flagged candidates */}
      <section>
        <SectionTitle title="⚠️ Flagged for review" subtitle={`${candidates.length} rep-KPI combos hit ${PIP_CONSECUTIVE_MISSES} straight misses`} accent="bg-amber-400" />
        {candidates.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">No one is currently flagged. 🎉</Card>
        ) : (
          <div className="space-y-3">
            {candidates.map((c) => (
              <Card key={`${c.userId}-${c.kpiKey}`} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-800">{c.userName} · {c.kpiName}</div>
                    <div className="text-sm text-slate-500">Missed goal ({c.goal}) on {c.missedDates.map((d) => d.slice(5)).join(", ")}.</div>
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500">📋 Gap + suggested plan → open a PIP</summary>
                  <form action={openPip} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input type="hidden" name="userId" value={c.userId} />
                    <input type="hidden" name="kpiKey" value={c.kpiKey} />
                    <input type="hidden" name="kpiName" value={c.kpiName} />
                    <input type="hidden" name="reason" value={`${PIP_CONSECUTIVE_MISSES} consecutive days below goal (${c.kpiName}).`} />
                    <label className="sm:col-span-2"><span className={lbl}>Target to hit</span>
                      <input name="goalNote" defaultValue={`Reach ${c.goal} ${c.kpiName}/day for 5 straight days.`} className={inputCls} /></label>
                    <label className="sm:col-span-2"><span className={lbl}>Plan (from the gap coaching)</span>
                      <textarea name="plan" rows={3} defaultValue={`Why: ${c.coaching.diagnose}\nFix:\n- ${c.coaching.plan.join("\n- ")}`} className={inputCls} /></label>
                    <label><span className={lbl}>Support offered</span>
                      <input name="support" placeholder="better leads / internet fix / training" className={inputCls} /></label>
                    <label><span className={lbl}>Review date</span><input type="date" name="reviewDate" className={inputCls} /></label>
                    <input type="hidden" name="startDate" value={today} />
                    <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                      <input type="checkbox" name="emailDraft" defaultChecked /> Email me a supportive draft to review &amp; send to {c.userName.split(" ")[0]}
                    </label>
                    <div className="sm:col-span-2"><button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Open plan (Stage 1: Check-in and Support)</button></div>
                  </form>
                </details>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Active PIPs */}
      <section>
        <SectionTitle title="📂 Active plans" subtitle={`${openPips.length} open`} accent="bg-red-400" />
        {openPips.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">No active PIPs.</Card>
        ) : (
          <div className="space-y-4">
            {openPips.map((p) => {
              const sm = stageMeta(p.stage);
              const checkins: { date: string; note: string }[] = JSON.parse(p.checkins || "[]");
              return (
                <Card key={p.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-lg font-bold text-slate-800">{p.user.name} · {p.kpiName}</div>
                      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{sm.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={advancePip}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="action" value="advance" /><button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Advance stage →</button></form>
                      <form action={advancePip}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="action" value="resolve" /><button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">✓ Resolved</button></form>
                      <form action={advancePip}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="action" value="close" /><button className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100">Close (escalated)</button></form>
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                    Consequence this stage: {p.consequence || sm.consequence}
                  </div>

                  <form action={updatePip} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input type="hidden" name="id" value={p.id} />
                    <label className="sm:col-span-2"><span className={lbl}>Target</span><input name="goalNote" defaultValue={p.goalNote} className={inputCls} /></label>
                    <label className="sm:col-span-2"><span className={lbl}>Plan</span><textarea name="plan" rows={3} defaultValue={p.plan} className={inputCls} /></label>
                    <label><span className={lbl}>Support</span><input name="support" defaultValue={p.support} className={inputCls} /></label>
                    <label><span className={lbl}>Consequence (override)</span><input name="consequence" defaultValue={p.consequence} placeholder={sm.consequence} className={inputCls} /></label>
                    <label><span className={lbl}>Review date</span><input type="date" name="reviewDate" defaultValue={p.reviewDate} className={inputCls} /></label>
                    <div className="sm:col-span-2"><button className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">Save plan</button></div>
                  </form>

                  {/* check-ins */}
                  <div className="mt-3">
                    <div className="text-xs font-bold text-slate-600">Check-ins</div>
                    <ul className="mt-1 space-y-1 text-sm text-slate-600">
                      {checkins.map((c, i) => <li key={i}>• <span className="text-slate-400">{c.date}</span>: {c.note}</li>)}
                      {checkins.length === 0 && <li className="text-slate-400">No check-ins yet.</li>}
                    </ul>
                    <form action={addPipCheckin} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="date" name="date" defaultValue={today} className={`${inputCls} w-auto`} />
                      <input name="note" placeholder="What happened / what was discussed" className={`${inputCls} flex-1 min-w-48`} />
                      <button className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-300">+ Add check-in</button>
                    </form>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* History */}
      {closedPips.length > 0 && (
        <section>
          <SectionTitle title="📜 History" subtitle="Resolved / escalated" accent="bg-slate-300" />
          <Card className="p-2">
            <ul className="divide-y divide-slate-100">
              {closedPips.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{p.user.name} · {p.kpiName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.status === "resolved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {p.status === "resolved" ? "✓ Resolved" : "Escalated"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <p className="text-center text-xs text-slate-400">
        Consequences shown are defaults you can override per plan. Pay, commission, and separation decisions are management's; this tool documents the process. Confirm with HR or counsel before any pay or separation action.
      </p>
    </div>
  );
}
