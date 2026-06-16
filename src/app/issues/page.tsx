import Link from "next/link";
import { addIssue, bumpIssue, solveIssue, dropIssue, reopenIssue, deleteIssue, addToDo, toggleToDo, deleteToDo } from "@/app/actions";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getSettings, getActiveReps } from "@/lib/data";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

export default async function IssuesPage({ searchParams }: { searchParams: Promise<{ raised?: string; empty?: string }> }) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <p className="mt-2 text-sm text-slate-500">The issues list is private to the owner. To raise something, use the Change Portal.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const leader = true;
  const [settings, reps, issues, todos] = await Promise.all([
    getSettings(),
    getActiveReps(),
    db.issue.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 300 }),
    db.toDo.findMany({ orderBy: [{ done: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }], take: 200 }),
  ]);
  const open = issues.filter((i) => i.status === "open");
  const closed = issues.filter((i) => i.status !== "open");
  const openTodos = todos.filter((t) => !t.done);
  const doneTodos = todos.filter((t) => t.done);
  const fmt = (ymd: string) => {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
  };
  const todayYmd = (() => {
    return new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date());
  })();
  const canClose = (_i: { owner: string; raisedBy: string }) => leader;
  const todoDonePct = todos.length ? Math.round((doneTodos.length / todos.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="🚧 Issues List"
        subtitle="Surface every obstacle, idea, or concern. In the meeting: prioritize the top 3, then Identify → Discuss → Solve."
        accent="bg-brand-gold"
        right={<div className="flex gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{open.length} open</span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">{todoDonePct}% to-dos done</span>
        </div>}
      />

      {sp.raised && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Issue added to the list.</div>}
      {sp.empty && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Add a title before submitting.</div>}

      {/* Raise an issue */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Raise an issue</h3>
        <form action={addIssue} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="sm:col-span-2"><span className={labelCls}>What's the issue? (obstacle, idea, or concern)</span><input name="title" placeholder="e.g. Dispo follow-up is slipping past 48h" className={inputCls} required /></label>
          <label><span className={labelCls}>List</span><select name="scope" defaultValue="leadership" className={inputCls}><option value="leadership">Leadership</option><option value="team">Team</option></select></label>
          <label className="sm:col-span-3"><span className={labelCls}>Detail (optional)</span><textarea name="detail" rows={2} className={inputCls} /></label>
          {leader && <label className="sm:col-span-3"><span className={labelCls}>Owner (optional)</span><select name="owner" defaultValue="" className={inputCls}><option value="">— unassigned</option>{reps.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select></label>}
          <div className="sm:col-span-3"><button className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Add to issues list</button></div>
        </form>
      </Card>

      {/* Open issues, prioritized */}
      <div>
        <SectionTitle title="Open issues — prioritized" subtitle="Top 3 are marked; solve #1 first, all the way through, before moving on" accent="bg-red-400" />
        <div className="space-y-3">
          {open.length === 0 && <Card className="p-10 text-center text-slate-400">No open issues — clean list. 🎉</Card>}
          {open.map((i, idx) => (
            <Card key={i.id} className="p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {idx < 3 && <span className="rounded-full bg-brand-gold px-2 py-0.5 text-xs font-bold text-brand-navy">#{idx + 1} priority</span>}
                <span className="flex-1 font-bold text-slate-800">{i.title}</span>
                <span className="text-xs text-slate-400">{i.raisedBy}{i.owner ? ` → ${i.owner}` : ""}</span>
                {i.scope === "team" && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">team</span>}
              </div>
              {i.detail && <p className="mb-2 whitespace-pre-wrap text-sm text-slate-600">{i.detail}</p>}

              <div className="flex flex-wrap items-center gap-2">
                {leader && idx !== 0 && (
                  <form action={bumpIssue}><input type="hidden" name="id" value={i.id} /><button className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">↑ Prioritize</button></form>
                )}
                {canClose(i) && (
                  <details className="inline-block">
                    <summary className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700">Solve</summary>
                    <form action={solveIssue} className="mt-2 grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200 sm:w-[28rem]">
                      <input type="hidden" name="id" value={i.id} />
                      <label><span className={labelCls}>The decision / how it was solved</span><input name="solveNote" placeholder="What did we decide?" className={inputCls} /></label>
                      <div className="border-t border-slate-200 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Optional 7-day to-do</div>
                      <label><span className={labelCls}>Action item</span><input name="todoText" placeholder="e.g. Rebuild the dispo follow-up cadence" className={inputCls} /></label>
                      <div className="grid grid-cols-2 gap-2">
                        <label><span className={labelCls}>Owner</span><select name="todoOwner" defaultValue={i.owner} className={inputCls}><option value="">— owner</option>{reps.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select></label>
                        <label><span className={labelCls}>Due</span><input name="todoDue" type="date" className={inputCls} /></label>
                      </div>
                      <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Mark solved</button>
                    </form>
                  </details>
                )}
                {canClose(i) && (
                  <form action={dropIssue}><input type="hidden" name="id" value={i.id} /><button className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-700">Drop</button></form>
                )}
                {leader && (
                  <form action={deleteIssue} className="ml-auto"><input type="hidden" name="id" value={i.id} /><button className="text-xs font-medium text-slate-300 hover:text-red-600">Delete</button></form>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* To-Do list */}
      <div>
        <SectionTitle title="✅ To-Do List" subtitle="7-day action items. Target 90% done each week." accent="bg-emerald-400" />
        <Card className="p-5">
          <form action={addToDo} className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-6">
            <input name="text" placeholder="Add an action item…" className={`${inputCls} sm:col-span-3`} required />
            <select name="owner" defaultValue="" className={`${inputCls} sm:col-span-1`}><option value="">— owner</option>{reps.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select>
            <input name="dueDate" type="date" className={`${inputCls} sm:col-span-1`} />
            <button className="rounded-lg bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700 sm:col-span-1">+ Add</button>
          </form>

          <div className="space-y-1.5">
            {openTodos.length === 0 && <p className="text-sm text-slate-400">No open to-dos.</p>}
            {openTodos.map((t) => {
              const overdue = t.dueDate && t.dueDate < todayYmd;
              return (
                <div key={t.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                  <form action={toggleToDo}><input type="hidden" name="id" value={t.id} /><button title="Mark done" className="grid h-5 w-5 place-items-center rounded border border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-500">✓</button></form>
                  <span className="flex-1 text-sm text-slate-700">{t.text}{t.fromIssue && <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700">from issue</span>}</span>
                  {t.owner && <span className="text-xs text-slate-500">{t.owner}</span>}
                  {t.dueDate && <span className={`text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-400"}`}>{fmt(t.dueDate)}</span>}
                  {leader && <form action={deleteToDo}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-slate-300 hover:text-red-600">✕</button></form>}
                </div>
              );
            })}
          </div>

          {doneTodos.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-700">{doneTodos.length} done</summary>
              <div className="mt-2 space-y-1">
                {doneTodos.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-1 text-sm text-slate-400">
                    <form action={toggleToDo}><input type="hidden" name="id" value={t.id} /><button title="Reopen" className="grid h-5 w-5 place-items-center rounded border border-emerald-500 bg-emerald-500 text-[11px] text-white">✓</button></form>
                    <span className="flex-1 line-through">{t.text}</span>
                    {t.owner && <span className="text-xs">{t.owner}</span>}
                    {leader && <form action={deleteToDo}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-slate-300 hover:text-red-600">✕</button></form>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </Card>
      </div>

      {/* Solved / dropped archive */}
      {closed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-slate-500 hover:text-brand-navy">Solved &amp; dropped ({closed.length})</summary>
          <div className="mt-3 space-y-2">
            {closed.map((i) => (
              <Card key={i.id} className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${i.status === "solved" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"}`}>{i.status}</span>
                  <span className="flex-1 text-sm font-semibold text-slate-700">{i.title}</span>
                  <span className="text-xs text-slate-400">{i.raisedBy}</span>
                  {leader && <form action={reopenIssue}><input type="hidden" name="id" value={i.id} /><button className="text-xs font-medium text-slate-400 hover:text-brand-navy">Reopen</button></form>}
                  {leader && <form action={deleteIssue}><input type="hidden" name="id" value={i.id} /><button className="text-xs text-slate-300 hover:text-red-600">Delete</button></form>}
                </div>
                {i.solveNote && <p className="mt-1 text-xs text-slate-500">→ {i.solveNote}</p>}
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
