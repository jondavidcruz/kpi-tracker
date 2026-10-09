import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { addCrmTaskAction, toggleCrmTaskAction, setTaskPriorityAction, linkTaskAction, readTaskPriorities, saveTaskNoteAction, reassignTaskAction } from "../actions";
import { readTaskNotes } from "@/lib/task-notes";

export const dynamic = "force-dynamic";

// ✅ Tasks — the GHL global task manager: every task across every lead, with
// Due today / Overdue / Upcoming views and per-assignee filtering.
export default async function CrmTasksPage({ searchParams }: { searchParams: Promise<{ v?: string; who?: string; s?: string }> }) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">Tasks live inside the Seller CRM (acquisitions + managers).</Card>;
  const manager = isManager(me!);
  const sp = await searchParams;
  const v = ["today", "overdue", "upcoming", "done"].includes(sp.v ?? "") ? sp.v! : "all";
  // Default = MINE even for managers (Jon 2026-10-08); "Everyone" is ?who=all.
  const who = manager ? (sp.who === "all" ? "" : (sp.who ?? me!.name)) : me!.name;
  const today = new Date().toISOString().slice(0, 10);

  const where = {
    ...(who ? { assignedTo: { equals: who, mode: "insensitive" as const } } : {}),
    ...(v === "done" ? { doneAt: { not: null } } : { doneAt: null }),
    ...(v === "today" ? { due: today } : {}),
    ...(v === "overdue" ? { due: { not: "", lt: today } } : {}),
    ...(v === "upcoming" ? { due: { gt: today } } : {}),
  };
  const tasks = await db.crmTask.findMany({ where, orderBy: v === "done" ? { doneAt: "desc" } : [{ due: "asc" }, { id: "desc" }], take: 200 });
  const contactIds = [...new Set(tasks.map((t) => t.contactId).filter(Boolean))];
  const contacts = await db.crmContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, phone: true } });
  const cname = new Map(contacts.map((c) => [c.id, c]));
  // priority colors (Jon 2026-10-08): 🔴 urgent · 🟡 pending (default) · ⚪ low
  const prios = await readTaskPriorities();
  const notes = await readTaskNotes();
  const prioOrder = (id: string) => (prios[id] === "urgent" ? 0 : prios[id] === "low" ? 2 : 1);
  // sort views (Jon 2026-10-08): priority (default, with group headers) · due date · person
  const sortMode = ["due", "person"].includes(sp.s ?? "") ? sp.s! : "prio";
  if (v !== "done") {
    if (sortMode === "due") tasks.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || prioOrder(a.id) - prioOrder(b.id));
    else if (sortMode === "person") tasks.sort((a, b) => a.assignedTo.localeCompare(b.assignedTo) || prioOrder(a.id) - prioOrder(b.id));
    else tasks.sort((a, b) => prioOrder(a.id) - prioOrder(b.id) || (a.due || "9999").localeCompare(b.due || "9999"));
  }
  const groupLabel = (t: (typeof tasks)[number]) =>
    sortMode === "due" ? (t.due ? (t.due < today ? "🔴 Overdue" : t.due === today ? "📅 Due today" : "📆 Upcoming") : "🗓 No date")
    : sortMode === "person" ? `👤 ${t.assignedTo.split(" ")[0] || "Unassigned"}`
    : prios[t.id] === "urgent" ? "🔴 Urgent" : prios[t.id] === "low" ? "⚪ Low priority" : "🟡 Pending";
  const reps = manager ? await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const counts = {
    all: await db.crmTask.count({ where: { doneAt: null, ...(who ? { assignedTo: { equals: who, mode: "insensitive" } } : {}) } }),
    overdue: await db.crmTask.count({ where: { doneAt: null, due: { not: "", lt: today }, ...(who ? { assignedTo: { equals: who, mode: "insensitive" } } : {}) } }),
  };
  const qs = (nv: string) => `/crm/tasks?v=${nv}&who=${encodeURIComponent(who || "all")}`;

  return (
    <div className="space-y-4">
      <SectionTitle title="✅ Tasks" subtitle="Everything that needs doing, across every lead — nothing slips." accent="bg-brand-gold"
        right={<Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Pipeline</Link>} />

      <div className="flex flex-wrap items-center gap-2">
        {[["all", `All open (${counts.all})`], ["today", "Due today"], ["overdue", `Overdue (${counts.overdue})`], ["upcoming", "Upcoming"], ["done", "Completed"]].map(([k, l]) => (
          <Link key={k} prefetch={false} href={qs(k)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${v === k ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</Link>
        ))}
        <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-slate-400">Group by:
          {([["prio", "Priority"], ["due", "Due date"], ["person", "Person"]] as const).map(([k, l]) => (
            <Link key={k} prefetch={false} href={`${qs(v)}&s=${k}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${sortMode === k ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}>{l}</Link>
          ))}
        </span>
      </div>
      {manager && (
        <div className="flex flex-wrap gap-1.5">
          <Link prefetch={false} href={`/crm/tasks?v=${v}&who=all`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${!who ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>Everyone</Link>
          {reps.map((r) => (
            <Link key={r.id} prefetch={false} href={`/crm/tasks?v=${v}&who=${encodeURIComponent(r.name)}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${who === r.name ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>{r.name.split(" ")[0]}</Link>
          ))}
        </div>
      )}

      <Card className="p-3">
        <form action={addCrmTaskAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="oppId" value="" />
          <input type="hidden" name="contactId" value="" />
          <input name="title" required placeholder="➕ New task — what needs doing?" className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <input name="note" placeholder="description / steps (optional)" className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <input name="due" type="date" className="rounded-lg border border-slate-200 px-2 py-2 text-sm" />
          {manager ? (
            <select name="assignedTo" className="rounded-lg border border-slate-200 px-2 py-2 text-sm font-semibold">
              <option value="">me</option>
              {reps.map((r) => <option key={r.id} value={r.name}>{r.name.split(" ")[0]}</option>)}
            </select>
          ) : null}
          <button className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white">Add task</button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        {tasks.length === 0 && <div className="p-8 text-center text-sm text-slate-400">Nothing here — clean slate. 🎉</div>}
        {tasks.map((t, ti) => {
          const overdue = !t.doneAt && t.due && t.due < today;
          const p = prios[t.id] ?? "normal";
          const edge = t.doneAt ? "border-l-emerald-400" : p === "urgent" ? "border-l-red-500" : p === "low" ? "border-l-slate-200" : "border-l-amber-400";
          const c = t.contactId ? cname.get(t.contactId) : undefined;
          const note = notes[t.id] ?? "";
          const gl = v !== "done" ? groupLabel(t) : null;
          const showHeader = gl && (ti === 0 || groupLabel(tasks[ti - 1]) !== gl);
          return (
            <div key={t.id}>
            {showHeader && <div className="border-b border-slate-100 bg-slate-100/70 px-4 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{gl}</div>}
            <details className={`border-b border-l-4 border-slate-50 ${edge} ${p === "urgent" && !t.doneAt ? "bg-red-50/40" : ""}`}>
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60">
              <form action={toggleCrmTaskAction}>
                <input type="hidden" name="id" value={t.id} />
                <button title={t.doneAt ? "Re-open" : "Mark done"} className={`grid h-5 w-5 place-items-center rounded-full border text-[10px] ${t.doneAt ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:text-emerald-600"}`}>✓</button>
              </form>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm ${t.doneAt ? "text-slate-400 line-through" : "font-semibold text-slate-800"}`}>{note && "📝 "}{t.title}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {c ? (
                    <Link href={t.oppId ? `/crm/${t.oppId}` : "/crm/contacts"} className="text-[11px] font-semibold text-indigo-500 hover:underline">👤 {c.name}{t.oppId ? " → open lead" : ""}</Link>
                  ) : !t.doneAt && (
                    <form action={linkTaskAction} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={t.id} />
                      <input name="q" placeholder="🔗 link to contact…" className="w-36 rounded border border-slate-200 px-1.5 py-0.5 text-[10px]" />
                      <button className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-slate-200">link</button>
                    </form>
                  )}
                  {t.doneAt && <span className="text-[10px] font-semibold text-emerald-600">✓ completed {t.doneAt.toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}{t.doneBy ? ` by ${t.doneBy.split(" ")[0]}` : ""}</span>}
                </div>
              </div>
              {!t.doneAt && (
                <span className="flex gap-1">
                  {([["urgent", "🔴"], ["normal", "🟡"], ["low", "⚪"]] as const).map(([k, dot]) => (
                    <form key={k} action={setTaskPriorityAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="p" value={k} />
                      <button title={k === "normal" ? "pending" : k} className={`rounded px-1 text-[11px] ${p === k ? "bg-slate-200" : "opacity-35 hover:opacity-100"}`}>{dot}</button>
                    </form>
                  ))}
                </span>
              )}
              <span className="text-[11px] font-bold text-slate-500">{t.assignedTo.split(" ")[0] || "—"}</span>
              <span className={`w-24 text-right text-[11px] font-bold ${overdue ? "text-red-600" : "text-slate-400"}`}>{t.due || "no date"}</span>
              <span className="text-slate-300">›</span>
            </summary>
            {/* 📖 GHL-style detail: full title, description / step-by-step, meta */}
            <div className="space-y-2 border-t border-slate-100 bg-slate-50/40 px-12 py-3">
              <div className="text-sm font-bold text-slate-800">{t.title}</div>
              {note && <div className="whitespace-pre-wrap rounded-xl bg-white p-3 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">{note}</div>}
              <details>
                <summary className="cursor-pointer text-[11px] font-bold text-indigo-600">{note ? "✎ Edit description" : "＋ Add description / steps"}</summary>
                <form action={saveTaskNoteAction} className="mt-1.5 space-y-1.5">
                  <input type="hidden" name="id" value={t.id} />
                  <textarea name="note" rows={5} defaultValue={note} placeholder={"What needs to happen, step by step…\n1.\n2.\n3."} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
                  <button className="rounded-lg bg-brand-navy px-3 py-1.5 text-[11px] font-bold text-white">Save description</button>
                </form>
              </details>
              {manager && (
                <form action={reassignTaskAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={t.id} />
                  <span className="text-[10px] font-bold text-slate-400">👤 Belongs to</span>
                  <select name="assignedTo" defaultValue={t.assignedTo} className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px]">
                    {reps.map((r) => <option key={r.id} value={r.name}>{r.name.split(" ")[0]}</option>)}
                  </select>
                  <button className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-300">move</button>
                </form>
              )}
              <div className="text-[10px] text-slate-400">created {t.createdAt.toLocaleDateString("en-US")} by {t.createdBy || "—"}{t.doneAt ? ` · ✓ completed ${t.doneAt.toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}${t.doneBy ? ` by ${t.doneBy}` : ""}` : ""}</div>
            </div>
            </details>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
