import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr, friendlyDate } from "@/lib/date";
import { buildHuddleData } from "@/lib/huddle";
import { saveStandup, saveStandupEod, addStandupItem, saveStandupItem, deleteStandupItem, addHuddleTask, toggleHuddleTask, deleteHuddleTask, addHuddleCheck, toggleHuddleCheck, deleteHuddleCheck } from "@/app/actions";
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
  const h = await buildHuddleData(date, { carry: date === todayStr(settings.orgTimezone) });

  const acq = h.reps.filter((r) => r.role === "Acquisitions");
  const dispo = h.reps.filter((r) => r.role === "Dispositions");
  const other = h.reps.filter((r) => r.role === "Team");
  const missByUser = new Map<string, typeof h.misses>();
  for (const m of h.misses) { const k = m.userId ?? "team"; const arr = missByUser.get(k) ?? []; arr.push(m); missByUser.set(k, arr); }

  // A click-to-complete checklist (goals for today / pending from yesterday).
  const Checklist = ({ label, kind, items, canEdit, userId, legacy }: { label: string; kind: "goal" | "pending"; items: { id: string; text: string; done: boolean }[]; canEdit: boolean; userId: string; legacy?: string }) => (
    <div>
      <div className="mb-1 text-xs font-semibold text-slate-500">{label}</div>
      <div className="space-y-1">
        {items.length === 0 && !legacy && <div className="text-xs text-slate-300">Nothing yet.</div>}
        {legacy && items.length === 0 && <div className="text-xs text-slate-400">{legacy}</div>}
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 text-sm">
            {canEdit ? (
              <form action={toggleHuddleCheck}><input type="hidden" name="id" value={it.id} /><button title="Toggle done" className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${it.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-emerald-400"}`}>✓</button></form>
            ) : (
              <span className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${it.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 text-transparent"}`}>✓</span>
            )}
            <span className={it.done ? "flex-1 text-slate-400 line-through" : "flex-1 text-slate-700"}>{it.text}</span>
            {canEdit && <form action={deleteHuddleCheck}><input type="hidden" name="id" value={it.id} /><button className="text-slate-300 hover:text-red-600">×</button></form>}
          </div>
        ))}
      </div>
      {canEdit && (
        <form action={addHuddleCheck} className="mt-1 flex items-center gap-2">
          <input type="hidden" name="userId" value={userId} /><input type="hidden" name="date" value={date} /><input type="hidden" name="kind" value={kind} />
          <input name="text" placeholder={kind === "goal" ? "add a goal…" : "add a pending item…"} className={inputCls} required />
          <button className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">+</button>
        </form>
      )}
    </div>
  );

  const RepCard = ({ r }: { r: (typeof h.reps)[number] }) => {
    const canEdit = manager || me.id === r.id;
    const myMiss = missByUser.get(r.id) ?? [];
    return (
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-base font-bold text-slate-800">{r.name}</span>
          <span className="text-[11px] text-slate-400">{r.role}</span>
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

        {/* Carried over from yesterday's end-of-day */}
        {r.yesterdayFollowup && (
          <div className="mb-3 rounded-lg bg-sky-50 p-2.5 text-sm ring-1 ring-sky-200">
            <span className="text-[11px] font-bold uppercase tracking-wide text-sky-500">📌 Follow up from yesterday</span>
            {r.yesterdayHit && <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${r.yesterdayHit === "hit" ? "bg-emerald-100 text-emerald-700" : r.yesterdayHit === "miss" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{r.yesterdayHit}</span>}
            <div className="mt-0.5 text-slate-700">{r.yesterdayFollowup}</div>
          </div>
        )}

        {/* Goals + Pending — click-to-complete checklists */}
        <div className="space-y-3">
          <Checklist label="🎯 Goals for today" kind="goal" items={r.goals} canEdit={canEdit} userId={r.id} legacy={r.goal} />
          {r.role === "Acquisitions" && <p className="-mt-1.5 text-[11px] text-amber-600">👇 Base today&apos;s goals on your hottest leads below — what will you do to close them?</p>}
          <Checklist label="⏮ Pending from yesterday" kind="pending" items={r.pendings} canEdit={canEdit} userId={r.id} legacy={r.pending} />

          {/* Notes */}
          {canEdit ? (
            <form action={saveStandup} className="space-y-1">
              <input type="hidden" name="userId" value={r.id} />
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="goal" value={r.goal} />
              <input type="hidden" name="pending" value={r.pending} />
              <label className="block text-xs"><span className="mb-0.5 block font-semibold text-slate-500">{r.role === "Dispositions" ? "🧾 Buyers / developers · lost or releasing · price reductions" : "📝 Notes"}</span><textarea name="note" defaultValue={r.note} rows={2} className={inputCls} /></label>
              <div className="flex items-center"><button className="ml-auto rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">Save notes</button></div>
            </form>
          ) : r.note ? (
            <p className="text-sm"><span className="font-semibold text-slate-500">📝</span> {r.note}</p>
          ) : null}
        </div>

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

        {/* End of day — recorded at the EOD meeting; follow-ups carry to tomorrow */}
        {canEdit ? (
          <form action={saveStandupEod} className="mt-3 rounded-lg bg-slate-900/[0.03] p-2.5 ring-1 ring-slate-200">
            <input type="hidden" name="userId" value={r.id} />
            <input type="hidden" name="date" value={date} />
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">🌙 End of day
              <select name="eodHit" defaultValue={r.eodHit} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold">
                <option value="">— hit goal? —</option><option value="hit">✅ Hit</option><option value="partial">🟡 Partial</option><option value="miss">❌ Missed</option>
              </select>
            </div>
            {r.role === "Acquisitions" && r.items.length > 0 && (
              <div className="mb-1.5 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800 ring-1 ring-amber-100">
                🔥 Hot leads to update: {r.items.map((it) => it.title).join(" · ")} — where did each one move today, and what&apos;s the next step to close?
              </div>
            )}
            <textarea name="eodNote" defaultValue={r.eodNote} rows={1} placeholder="What happened today?" className={`${inputCls} mb-1.5`} />
            <textarea name="eodFollowup" defaultValue={r.eodFollowup} rows={1} placeholder="Follow-up / next action for tomorrow (shows on tomorrow's huddle)" className={inputCls} />
            <div className="mt-1.5 text-right"><button className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">Save end of day</button></div>
          </form>
        ) : (r.eodHit || r.eodNote || r.eodFollowup) ? (
          <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs ring-1 ring-slate-200">
            <span className="font-bold text-slate-500">🌙 EOD:</span> {r.eodHit && <span className="font-semibold">{r.eodHit}</span>} {r.eodNote}{r.eodFollowup && <div className="mt-0.5 text-slate-500">→ Tomorrow: {r.eodFollowup}</div>}
          </div>
        ) : null}
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
            <Link href="/huddle/history" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200">📜 History</Link>
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
