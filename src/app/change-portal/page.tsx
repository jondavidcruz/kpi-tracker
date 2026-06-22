import { submitChangeRequest, addChangeComment, setChangeStatus, deleteChangeRequest } from "@/app/actions";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import HubTabs from "@/components/HubTabs";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

const CATEGORIES = ["script", "schedule", "process", "tool", "marketing", "other"];
const CAT_LABEL: Record<string, string> = { script: "Script", schedule: "Schedule", process: "Process", tool: "Tool", marketing: "Marketing", other: "Other" };
const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-slate-200 text-slate-700" },
  reviewing: { label: "Reviewing", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", cls: "bg-sky-100 text-sky-800" },
  implemented: { label: "Implemented", cls: "bg-emerald-100 text-emerald-800" },
  declined: { label: "Declined", cls: "bg-slate-200 text-slate-500" },
};

export default async function ChangePortalPage({ searchParams }: { searchParams: Promise<{ sent?: string; empty?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const sp = await searchParams;
  const leader = isManager(me);
  const settings = await getSettings();
  const requests = await db.changeRequest.findMany({
    where: leader ? {} : { submittedBy: me.name },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { comments: { orderBy: { createdAt: "asc" } } },
    take: 200,
  });
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: settings.orgTimezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

  return (
    <div className="space-y-6">
      <HubTabs tabs={[{ href: "/tickets", label: "Tickets" }, { href: "/change-portal", label: "Suggestions" }]} />
      <SectionTitle title="🛠 Change / Improvement Portal" subtitle="Request a change to a script, schedule, process, or anything in the business. Leadership reviews and replies." accent="bg-brand-gold" />

      {sp.sent && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Submitted. Leadership will review and reply here.</div>}
      {sp.empty && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Add a title before submitting.</div>}

      {/* Submit */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Request a change</h3>
        <form action={submitChangeRequest} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="sm:col-span-2"><span className={labelCls}>What would you like changed?</span><input name="title" placeholder="e.g. Update the cold-call opener script" className={inputCls} required /></label>
          <label><span className={labelCls}>Category</span><select name="category" defaultValue="other" className={inputCls}>{CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select></label>
          <label className="sm:col-span-3"><span className={labelCls}>Details — what & why</span><textarea name="body" rows={3} placeholder="What's the current problem, and what would you change?" className={inputCls} /></label>
          <div className="sm:col-span-3"><button className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Submit request</button></div>
        </form>
      </Card>

      <SectionTitle title={leader ? "All requests" : "Your requests"} subtitle={leader ? "Review, set status, and reply in the thread" : "Track status and discuss with leadership"} accent="bg-sky-400" />

      <div className="space-y-3">
        {requests.length === 0 && <Card className="p-10 text-center text-slate-400">No requests yet.</Card>}
        {requests.map((r) => {
          const st = STATUS[r.status] ?? STATUS.open;
          return (
            <Card key={r.id} id={`req-${r.id}`} className="scroll-mt-4 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{CAT_LABEL[r.category] ?? r.category}</span>
                <span className="flex-1 font-bold text-slate-800">{r.title}</span>
                <span className="text-xs text-slate-400">{r.submittedBy} · {fmt(r.createdAt)}</span>
              </div>
              {r.body && <p className="mb-2 whitespace-pre-wrap text-sm text-slate-600">{r.body}</p>}
              {r.reviewNote && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800">Leadership: {r.reviewNote}</p>}

              {/* Two-way thread */}
              {r.comments.length > 0 && (
                <div className="mb-2 space-y-1.5 border-l-2 border-slate-200 pl-3">
                  {r.comments.map((c) => (
                    <div key={c.id} className="text-sm">
                      <span className={`font-semibold ${c.byLeadership ? "text-brand-navy" : "text-slate-700"}`}>{c.author}{c.byLeadership ? " (leadership)" : ""}:</span>{" "}
                      <span className="text-slate-600">{c.body}</span>
                      <span className="ml-1 text-[11px] text-slate-400">· {fmt(c.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
              <form action={addChangeComment} className="flex gap-2">
                <input type="hidden" name="requestId" value={r.id} />
                <input name="body" placeholder="Reply…" className={`${inputCls} flex-1`} required />
                <button className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">Reply</button>
              </form>

              {leader && (
                <form action={setChangeStatus} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="id" value={r.id} />
                  <label><span className={labelCls}>Status</span>
                    <select name="status" defaultValue={r.status} className={`${inputCls} w-36`}>{Object.keys(STATUS).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
                  </label>
                  <label className="flex-1"><span className={labelCls}>Review note (emailed to submitter)</span><input name="reviewNote" defaultValue={r.reviewNote} className={inputCls} /></label>
                  <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Update</button>
                </form>
              )}
              {leader && (
                <form action={deleteChangeRequest} className="mt-2">
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-xs font-medium text-slate-400 hover:text-red-600">Delete</button>
                </form>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
