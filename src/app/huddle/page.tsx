import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr, friendlyDate } from "@/lib/date";
import { buildHuddleData } from "@/lib/huddle";
import { saveStandup, addStandupItem, saveStandupItem, deleteStandupItem, addHuddleTask, toggleHuddleTask, deleteHuddleTask } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const AGE_CLS: Record<string, string> = { fresh: "bg-emerald-100 text-emerald-700", watch: "bg-amber-100 text-amber-700", reduce: "bg-orange-100 text-orange-700", stale: "bg-red-100 text-red-700" };

export default async function HuddlePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;
  const sp = await searchParams;
  const settings = await getSettings();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayStr(settings.orgTimezone);
  const manager = isManager(me);
  const h = await buildHuddleData(date);

  const acq = h.reps.filter((r) => r.role === "Acquisitions");
  const dispo = h.reps.filter((r) => r.role === "Dispositions");
  const other = h.reps.filter((r) => r.role === "Team");
  const missByUser = new Map<string, typeof h.misses>();
  for (const m of h.misses) { const k = m.userId ?? "team"; const arr = missByUser.get(k) ?? []; arr.push(m); missByUser.set(k, arr); }

  const RepCard = ({ r }: { r: (typeof h.reps)[number] }) => {
    const canEdit = manager || me.id === r.id;
    const myMiss = missByUser.get(r.id) ?? [];
    return (
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-base font-bold text-slate-800">{r.name}</span>
          <span className="text-[11px] text-slate-400">{r.role}</span>
          {r.submitted ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">submitted</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">not submitted</span>}
          {myMiss.length > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">missed {myMiss.length} KPI{myMiss.length > 1 ? "s" : ""} yesterday</span>}
        </div>

        {/* Yesterday's misses for this rep */}
        {myMiss.length > 0 && (
          <div className="mb-3 rounded-lg bg-red-50 p-2.5 text-xs ring-1 ring-red-200">
            <div className="font-bold text-red-700">Yesterday&apos;s misses — why, and the fix?</div>
            {myMiss.map((m, i) => (
              <div key={i} className="mt-1 text-red-800">• <strong>{m.kpi}</strong>: {Math.round(m.actual)} vs goal {Math.round(m.expected)}{m.repReason ? ` — “${m.repReason}”` : ""}{m.fix ? ` → fix: ${m.fix}` : ""}</div>
            ))}
          </div>
        )}

        {/* From the leader — assigned tasks / notes (Jon or Marie) */}
        {(r.tasks.length > 0 || manager) && (
          <div className="mb-3 rounded-lg bg-indigo-50 p-2.5 ring-1 ring-indigo-200">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-indigo-500">📋 From your leader</div>
            <div className="space-y-1">
              {r.tasks.length === 0 && <div className="text-xs text-indigo-300">No tasks assigned.</div>}
              {r.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <form action={toggleHuddleTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <button title={r.id === me.id || manager ? "Toggle done" : ""} className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${t.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-indigo-300 bg-white text-transparent hover:border-indigo-400"}`}>✓</button>
                  </form>
                  <span className={t.done ? "flex-1 text-slate-400 line-through" : "flex-1 text-slate-700"}>{t.text}</span>
                  {t.assignedBy && <span className="text-[10px] text-slate-400">— {t.assignedBy.split(" ")[0]}</span>}
                  {manager && <form action={deleteHuddleTask}><input type="hidden" name="id" value={t.id} /><button className="text-slate-300 hover:text-red-600">×</button></form>}
                </div>
              ))}
            </div>
            {manager && (
              <form action={addHuddleTask} className="mt-1.5 flex flex-wrap items-end gap-2">
                <input type="hidden" name="userId" value={r.id} />
                <input name="text" placeholder={`Assign ${r.name.split(" ")[0]} a task or note…`} className={`${inputCls} min-w-48 flex-1`} required />
                <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Assign</button>
              </form>
            )}
          </div>
        )}

        {/* Goal / pending / note */}
        {canEdit ? (
          <form action={saveStandup} className="space-y-2">
            <input type="hidden" name="userId" value={r.id} />
            <input type="hidden" name="date" value={date} />
            <label className="block text-xs"><span className="mb-0.5 block font-semibold text-slate-500">🎯 Goal for today</span><textarea name="goal" defaultValue={r.goal} rows={1} className={inputCls} /></label>
            <label className="block text-xs"><span className="mb-0.5 block font-semibold text-slate-500">⏮ Pending from yesterday</span><textarea name="pending" defaultValue={r.pending} rows={1} className={inputCls} /></label>
            <label className="block text-xs"><span className="mb-0.5 block font-semibold text-slate-500">{r.role === "Dispositions" ? "🧾 Buyers / developers · lost or releasing · price reductions" : "📝 Notes"}</span><textarea name="note" defaultValue={r.note} rows={2} className={inputCls} /></label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" name="submitted" defaultChecked={r.submitted} /> submitted</label>
              <button className="ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">Save</button>
            </div>
          </form>
        ) : (
          <div className="space-y-1 text-sm">
            <p><span className="font-semibold text-slate-500">🎯 Goal:</span> {r.goal || <span className="text-slate-400">—</span>}</p>
            <p><span className="font-semibold text-slate-500">⏮ Pending:</span> {r.pending || <span className="text-slate-400">—</span>}</p>
            {r.note && <p><span className="font-semibold text-slate-500">📝</span> {r.note}</p>}
          </div>
        )}

        {/* Acquisitions — hottest leads */}
        {r.role === "Acquisitions" && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">🔥 Hottest deals — status · roadblock · next step · today</div>
            <div className="space-y-2">
              {r.items.length === 0 && <div className="text-xs text-slate-400">No hot leads added yet.</div>}
              {r.items.map((it) => (
                canEdit ? (
                  <div key={it.id} className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                    <div className="mb-1 flex items-center gap-2"><span className="flex-1 text-sm font-semibold text-slate-700">{it.title}</span>
                      <form action={deleteStandupItem}><input type="hidden" name="id" value={it.id} /><button className="text-slate-300 hover:text-red-600">×</button></form>
                    </div>
                    <form action={saveStandupItem}>
                      <input type="hidden" name="id" value={it.id} />
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        <input name="status" defaultValue={it.status} placeholder="status" className={inputCls} />
                        <input name="roadblock" defaultValue={it.roadblock} placeholder="roadblock" className={inputCls} />
                        <input name="nextStep" defaultValue={it.nextStep} placeholder="next step" className={inputCls} />
                        <input name="todayAction" defaultValue={it.todayAction} placeholder="what we do today" className={inputCls} />
                      </div>
                      <div className="mt-1 text-right"><button className="rounded bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800">Save</button></div>
                    </form>
                  </div>
                ) : (
                  <div key={it.id} className="rounded-lg bg-slate-50 p-2 text-xs ring-1 ring-slate-200">
                    <div className="font-semibold text-slate-700">{it.title}</div>
                    <div className="text-slate-500">{[it.status && `status: ${it.status}`, it.roadblock && `roadblock: ${it.roadblock}`, it.nextStep && `next: ${it.nextStep}`, it.todayAction && `today: ${it.todayAction}`].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                )
              ))}
            </div>
            {canEdit && (
              <form action={addStandupItem} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="userId" value={r.id} /><input type="hidden" name="date" value={date} />
                <input name="title" placeholder="add a hot lead (address / seller)" className={`${inputCls} min-w-48 flex-1`} required />
                <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">+ Add</button>
              </form>
            )}
          </div>
        )}

        {/* Dispositions — their active deals from the board */}
        {r.role === "Dispositions" && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">📦 Active deals (from the Deals board)</div>
            <div className="space-y-1.5">
              {r.deals.length === 0 && <div className="text-xs text-slate-400">No active deals assigned.</div>}
              {r.deals.map(({ deal, days, level, recommendation }) => (
                <div key={deal.id} className="rounded-lg bg-slate-50 p-2 text-xs ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-700">{deal.address}</span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{deal.status.replace(/_/g, " ")}</span>
                    {days != null && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${AGE_CLS[level] ?? "bg-slate-100"}`}>{days}d on market</span>}
                  </div>
                  {deal.nextSteps && <div className="mt-0.5 text-slate-500">Next: {deal.nextSteps}</div>}
                  <div className="mt-0.5 text-slate-400">{recommendation}</div>
                </div>
              ))}
            </div>
            <Link href="/deals" className="mt-1.5 inline-block text-[11px] font-semibold text-slate-400 underline hover:text-brand-navy">Edit deal status & next steps on the Deals board →</Link>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <SectionTitle title="🗣️ Daily Huddle — 9 AM" subtitle="Run it role by role. Each person fills in before the meeting; leaders edit live."
        accent="bg-brand-gold"
        right={
          <div className="flex items-center gap-3">
            {settings.huddleMeetLink && <a href={settings.huddleMeetLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">🎥 Join Meet</a>}
            <span className="text-sm font-semibold text-slate-500">{friendlyDate(date)}</span>
          </div>
        } />
      {settings.huddleMeetLink && (
        <p className="-mt-2 text-[11px] text-slate-400">📞 Dial-in: (US) +1 413-829-7688 · PIN 517 408 335#</p>
      )}

      {/* Accountability */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">📉 Yesterday ({friendlyDate(h.prev)}) — KPIs missed</div>
            {h.misses.length === 0 ? <p className="text-sm text-emerald-600">Everyone hit their targets. 🎉</p> : (
              <ul className="space-y-1 text-sm">
                {h.misses.map((m, i) => (
                  <li key={i} className="text-slate-600"><strong>{m.name}</strong> — {m.kpi} ({Math.round(m.actual)}/{Math.round(m.expected)}){m.repReason ? <span className="text-slate-400"> · “{m.repReason}”</span> : ""}</li>
                ))}
              </ul>
            )}
            {h.misses.length > 0 && <p className="mt-1 text-[11px] text-slate-400">Address the why + the fix per rep below. Manager justifications live on <Link href="/alerts" className="underline">Alerts</Link>.</p>}
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">🟠 On a PIP → works Saturday</div>
            {h.pips.length === 0 ? <p className="text-sm text-slate-400">Nobody on a PIP.</p> : (
              <ul className="space-y-1 text-sm">
                {h.pips.map((p, i) => <li key={i} className="text-slate-700">🟠 <strong>{p.name}</strong> — {p.kpiName} → <span className="font-semibold text-orange-600">works Saturday</span></li>)}
              </ul>
            )}
          </div>
        </div>
      </Card>

      {/* Acquisitions */}
      {acq.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-700">🎯 Acquisitions</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{acq.map((r) => <RepCard key={r.id} r={r} />)}</div>
        </section>
      )}

      {/* Dispositions */}
      {dispo.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-700">📦 Dispositions</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{dispo.map((r) => <RepCard key={r.id} r={r} />)}</div>
        </section>
      )}

      {other.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-700">Team</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{other.map((r) => <RepCard key={r.id} r={r} />)}</div>
        </section>
      )}
    </div>
  );
}
