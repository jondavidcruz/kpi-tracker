import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { submitTicket, setTicketStatus, deleteTicket } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";
import TicketSubmitButton from "@/components/TicketSubmitButton";

export const dynamic = "force-dynamic";

const AREAS = ["Enter KPIs", "Dashboard", "Alerts", "Speed test", "Deals", "Login", "Wall display", "Other"];
const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const lbl = "mb-0.5 block text-[11px] font-semibold text-slate-500";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: "Awaiting your approval", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved — queued", cls: "bg-sky-100 text-sky-800" },
  in_progress: { label: "Being worked on", cls: "bg-violet-100 text-violet-800" },
  resolved: { label: "Resolved", cls: "bg-emerald-100 text-emerald-700" },
  declined: { label: "Declined", cls: "bg-slate-200 text-slate-600" },
};

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ sent?: string; empty?: string }> }) {
  const me = await getCurrentUser();
  const sp = await searchParams;
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;

  const manager = isManager(me);
  const myTickets = await db.ticket.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const allTickets = manager
    ? await db.ticket.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { user: true }, take: 100 })
    : [];

  // The diagnose queue = approved + in_progress; "new" awaits approval.
  const queue = { new: [] as typeof allTickets, active: [] as typeof allTickets, done: [] as typeof allTickets };
  for (const t of allTickets) {
    if (t.status === "new") queue.new.push(t);
    else if (t.status === "approved" || t.status === "in_progress") queue.active.push(t);
    else queue.done.push(t);
  }

  return (
    <div className="space-y-7">
      <SectionTitle
        title="🎫 Tracker Tickets"
        subtitle="Report something broken or confusing in the app. Nothing changes until an admin approves it."
        accent="bg-sky-400"
      />
      {sp.sent && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Ticket submitted. Jon will review it before anything is changed.</div>}
      {sp.empty && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Please type a summary or some details before submitting.</div>}

      {/* Submit form — open to everyone signed in */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Report an issue</h3>
        <form action={submitTicket} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={lbl}>What&apos;s the problem? <span className="font-normal text-slate-400">(a short summary)</span></span>
            <input name="title" placeholder="e.g. Speed test button spins forever" className={inputCls} />
          </label>
          <label>
            <span className={lbl}>Where in the app?</span>
            <select name="area" defaultValue="" className={inputCls}>
              <option value="">Pick a screen…</option>
              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label>
            <span className={lbl}>How bad is it?</span>
            <select name="severity" defaultValue="normal" className={inputCls}>
              <option value="blocking">Blocking — I can&apos;t work</option>
              <option value="normal">Normal — annoying but I can work</option>
              <option value="minor">Minor — small / cosmetic</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={lbl}>Details <span className="font-normal text-slate-400">(what you did, what happened, what you expected)</span></span>
            <textarea name="body" rows={4} placeholder="Steps to reproduce help a lot…" className={inputCls} />
          </label>
          <div className="sm:col-span-2">
            <TicketSubmitButton />
            <span className="ml-3 text-xs text-slate-400">This files a report only — it can&apos;t change the system.</span>
          </div>
        </form>
      </Card>

      {/* Manager triage queue — the approval gate */}
      {manager && (
        <section className="space-y-4">
          <SectionTitle title="Triage queue" subtitle="You approve what gets worked on. Reps can&apos;t move tickets — only you can." accent="bg-violet-400" />

          <TicketGroup title={`⏳ Awaiting approval (${queue.new.length})`} empty="Nothing waiting.">
            {queue.new.map((t) => <AdminTicket key={t.id} t={t} stage="new" />)}
          </TicketGroup>

          <TicketGroup title={`🔧 Approved / in progress (${queue.active.length})`} empty="Queue is clear.">
            {queue.active.map((t) => <AdminTicket key={t.id} t={t} stage="active" />)}
          </TicketGroup>

          {queue.done.length > 0 && (
            <TicketGroup title="✅ Resolved / declined" empty="">
              {queue.done.map((t) => <AdminTicket key={t.id} t={t} stage="done" />)}
            </TicketGroup>
          )}
        </section>
      )}

      {/* Everyone's own tickets */}
      <section>
        <SectionTitle title="Your tickets" subtitle="Track the status of what you've reported" accent="bg-slate-300" />
        {myTickets.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">You haven&apos;t filed any tickets yet.</Card>
        ) : (
          <div className="space-y-2">
            {myTickets.map((t) => {
              const m = STATUS_META[t.status] ?? STATUS_META.new;
              return (
                <Card key={t.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{t.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.cls}`}>{m.label}</span>
                  </div>
                  {t.body && <p className="mt-1 whitespace-pre-line text-sm text-slate-500">{t.body}</p>}
                  {t.adminNote && <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 ring-1 ring-slate-100"><strong>Note from Jon:</strong> {t.adminNote}</p>}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function TicketGroup({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = arr.flat().filter(Boolean).length === 0;
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-slate-700">{title}</h3>
      {isEmpty ? (empty ? <Card className="p-6 text-center text-sm text-slate-400">{empty}</Card> : null) : <div className="space-y-3">{children}</div>}
    </div>
  );
}

function AdminTicket({ t, stage }: { t: { id: string; title: string; body: string; area: string; severity: string; submittedBy: string; status: string; adminNote: string; createdAt: Date }; stage: "new" | "active" | "done" }) {
  const sevCls = t.severity === "blocking" ? "bg-red-100 text-red-700" : t.severity === "minor" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700";
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${sevCls}`}>{t.severity.toUpperCase()}</span>
            {t.area && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{t.area}</span>}
            <span className="text-xs text-slate-400">from {t.submittedBy}</span>
          </div>
          <p className="mt-1 font-semibold text-slate-800">{t.title}</p>
          {t.body && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-500">{t.body}</p>}
          {t.adminNote && <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 ring-1 ring-slate-100"><strong>Note:</strong> {t.adminNote}</p>}
        </div>
        <form action={deleteTicket} className="shrink-0">
          <input type="hidden" name="id" value={t.id} />
          <button className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600 hover:ring-red-200" title="Permanently delete this ticket">🗑 Delete</button>
        </form>
      </div>

      <form action={setTicketStatus} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <input type="hidden" name="id" value={t.id} />
        <label className="flex-1 min-w-48">
          <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Note (optional)</span>
          <input name="adminNote" defaultValue={t.adminNote} placeholder="why declined / how resolved" className={inputCls} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {stage === "new" && (
            <>
              <StatusButton status="approved" label="✓ Approve" cls="bg-sky-600 text-white hover:bg-sky-700" />
              <StatusButton status="declined" label="Decline" cls="bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100" />
            </>
          )}
          {stage === "active" && (
            <>
              {t.status === "approved" && <StatusButton status="in_progress" label="Start" cls="bg-violet-600 text-white hover:bg-violet-700" />}
              <StatusButton status="resolved" label="✓ Resolved" cls="bg-emerald-600 text-white hover:bg-emerald-700" />
              <StatusButton status="declined" label="Decline" cls="bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100" />
            </>
          )}
          {stage === "done" && <StatusButton status="approved" label="Reopen" cls="bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100" />}
        </div>
      </form>
    </Card>
  );
}

function StatusButton({ status, label, cls }: { status: string; label: string; cls: string }) {
  return (
    <button name="status" value={status} className={`rounded-lg px-3 py-2 text-xs font-semibold ${cls}`}>
      {label}
    </button>
  );
}
