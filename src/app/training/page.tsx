import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getActiveReps, getSettings } from "@/lib/data";
import { todayStr, friendlyDate } from "@/lib/date";
import { db } from "@/lib/db";
import { positionLabel } from "@/lib/roles";
import { addTrainingFocus, updateTrainingFocus, deleteTrainingFocus, addTrainingSchedule, deleteTrainingSchedule, logCoachingSession, deleteCoachingSession } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";
import AICoach from "@/components/AICoach";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const STATUS_CLS: Record<string, string> = { active: "bg-amber-100 text-amber-700", improving: "bg-sky-100 text-sky-700", mastered: "bg-emerald-100 text-emerald-700" };
const TYPE_LABEL: Record<string, string> = { call_review: "📞 Call review", live_coaching: "🎧 Live coaching", one_on_one: "🧑‍🏫 1:1" };
const CADENCE_LABEL: Record<string, string> = { daily: "Daily", weekly: "Weekly", "mon-fri": "Mon–Fri", "tue-fri": "Tue–Fri" };

export default async function TrainingPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return <Card className="mx-auto max-w-md p-8 text-center"><div className="mb-2 text-3xl">🔒</div><h1 className="text-xl font-bold">Managers only</h1><Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link></Card>;
  }
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const [reps, focuses, schedules, sessions] = await Promise.all([
    getActiveReps(),
    db.trainingFocus.findMany({ orderBy: { priority: "asc" } }),
    db.trainingSchedule.findMany({ where: { active: true } }),
    db.coachingSession.findMany({ orderBy: { date: "desc" }, take: 200 }),
  ]);
  const team = reps.filter((r) => r.position !== "");
  const focusBy = (id: string) => focuses.filter((f) => f.userId === id);
  const schedBy = (id: string) => schedules.filter((s) => s.userId === id);
  const sessBy = (id: string) => sessions.filter((s) => s.userId === id).slice(0, 6);

  return (
    <div className="space-y-5">
      <SectionTitle title="🎓 Training Portal" subtitle="Per-rep coaching plans, schedule, an AI coaching assistant, and a log of every session." accent="bg-brand-gold"
        right={<Link href="/call-scoring" className="text-sm font-semibold text-brand-navy hover:underline">🎧 Score a call →</Link>} />

      {/* AI coaching assistant — the live training aid */}
      <AICoach reps={team.map((r) => ({ name: r.name, role: r.position, skills: focusBy(r.id).map((f) => f.skill) }))} />

      {/* Weekly schedule board */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-slate-700">🗓 Training schedule</div>
        {schedules.length === 0 ? <p className="text-sm text-slate-400">No sessions scheduled yet — add one on a rep below.</p> : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {schedules.map((s) => {
              const rep = reps.find((r) => r.id === s.userId);
              return (
                <div key={s.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                  <span className="rounded-md bg-brand-navy px-1.5 py-0.5 text-[10px] font-bold text-white">{CADENCE_LABEL[s.cadence] ?? s.cadence}{s.time ? ` · ${s.time}` : ""}</span>
                  <div className="min-w-0 flex-1"><div className="font-semibold text-slate-700">{rep?.name?.split(" ")[0] ?? "—"}</div><div className="text-xs text-slate-500">{s.focus}</div></div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Per-rep coaching plans */}
      {team.map((rep) => {
        const repFocuses = focusBy(rep.id);
        const repSched = schedBy(rep.id);
        const repSess = sessBy(rep.id);
        return (
          <Card key={rep.id} className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-slate-800">{rep.name}</span>
              <span className="text-xs text-slate-400">{positionLabel(rep.position)}</span>
              {repSched.map((s) => <span key={s.id} className="rounded-full bg-brand-gold/20 px-2 py-0.5 text-[11px] font-semibold text-brand-navy">{CADENCE_LABEL[s.cadence] ?? s.cadence}{s.time ? ` ${s.time}` : ""}</span>)}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Focus skills */}
              <div>
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">🎯 Focus skills</div>
                <div className="space-y-1.5">
                  {repFocuses.length === 0 && <div className="text-xs text-slate-400">No focus areas yet.</div>}
                  {repFocuses.map((f, i) => (
                    <div key={f.id} className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-navy text-[10px] font-bold text-white">{i + 1}</span>
                        <span className="flex-1 text-sm font-semibold text-slate-700">{f.skill}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLS[f.status] ?? "bg-slate-100"}`}>{f.status}</span>
                        <form action={deleteTrainingFocus}><input type="hidden" name="id" value={f.id} /><button className="text-slate-300 hover:text-red-600">×</button></form>
                      </div>
                      {f.notes && <div className="mt-0.5 pl-7 text-xs text-slate-500">{f.notes}</div>}
                      <form action={updateTrainingFocus} className="mt-1 flex items-center gap-1.5 pl-7">
                        <input type="hidden" name="id" value={f.id} />
                        <select name="status" defaultValue={f.status} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]">
                          <option value="active">active</option><option value="improving">improving</option><option value="mastered">mastered</option>
                        </select>
                        <button className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-300">update</button>
                      </form>
                    </div>
                  ))}
                </div>
                <form action={addTrainingFocus} className="mt-2 space-y-1.5">
                  <input type="hidden" name="userId" value={rep.id} />
                  <input name="skill" placeholder="Add a focus skill…" required className={inputCls} />
                  <div className="flex gap-1.5">
                    <input name="notes" placeholder="note (optional)" className={inputCls} />
                    <button className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">+ Add</button>
                  </div>
                </form>
                {/* Schedule editing */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-brand-navy">🗓 Edit schedule</summary>
                  <div className="mt-1 space-y-1">
                    {repSched.map((s) => <div key={s.id} className="flex items-center gap-2 text-xs text-slate-500"><span className="flex-1">{CADENCE_LABEL[s.cadence] ?? s.cadence}{s.time ? ` ${s.time}` : ""} — {s.focus}</span><form action={deleteTrainingSchedule}><input type="hidden" name="id" value={s.id} /><button className="text-slate-300 hover:text-red-600">×</button></form></div>)}
                  </div>
                  <form action={addTrainingSchedule} className="mt-1 flex flex-wrap items-end gap-1.5">
                    <input type="hidden" name="userId" value={rep.id} />
                    <select name="cadence" defaultValue="weekly" className="rounded border border-slate-300 px-1.5 py-1 text-xs"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="mon-fri">Mon–Fri</option><option value="tue-fri">Tue–Fri</option></select>
                    <input name="time" placeholder="9:30 AM" className="w-20 rounded border border-slate-300 px-1.5 py-1 text-xs" />
                    <input name="focus" placeholder="what it covers" required className="min-w-32 flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs" />
                    <button className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white">+</button>
                  </form>
                </details>
              </div>

              {/* Coaching log */}
              <div>
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">🧑‍🏫 Coaching log</div>
                <form action={logCoachingSession} className="space-y-1.5 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                  <input type="hidden" name="userId" value={rep.id} />
                  <div className="flex gap-1.5">
                    <input type="date" name="date" defaultValue={today} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
                    <select name="type" defaultValue="call_review" className="flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs"><option value="call_review">📞 Call review</option><option value="live_coaching">🎧 Live coaching</option><option value="one_on_one">🧑‍🏫 1:1</option></select>
                    <select name="rating" defaultValue="" className="rounded border border-slate-300 px-1.5 py-1 text-xs"><option value="">rate</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}★</option>)}</select>
                  </div>
                  <input name="skill" placeholder="skill worked on (e.g. rapport)" className={inputCls} />
                  <textarea name="notes" placeholder="What happened / what to fix…" rows={2} required className={inputCls} />
                  <div className="flex gap-1.5">
                    <input name="nextStep" placeholder="next step" className={inputCls} />
                    <button className="shrink-0 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy-700">Log</button>
                  </div>
                </form>
                <div className="mt-2 space-y-1.5">
                  {repSess.length === 0 && <div className="text-xs text-slate-400">No sessions logged yet.</div>}
                  {repSess.map((s) => (
                    <div key={s.id} className="rounded-lg border border-slate-100 p-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-600">{TYPE_LABEL[s.type] ?? s.type}</span>
                        {s.skill && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{s.skill}</span>}
                        {s.rating != null && <span className="text-amber-500">{"★".repeat(s.rating)}</span>}
                        <span className="ml-auto text-[10px] text-slate-300">{friendlyDate(s.date)}</span>
                        <form action={deleteCoachingSession}><input type="hidden" name="id" value={s.id} /><button className="text-slate-300 hover:text-red-600">×</button></form>
                      </div>
                      <div className="mt-0.5 text-slate-600">{s.notes}</div>
                      {s.nextStep && <div className="mt-0.5 text-emerald-700">→ {s.nextStep}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
