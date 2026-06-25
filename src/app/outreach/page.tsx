import Link from "next/link";
import { getCurrentUser, canApproveOutreach } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import { approveOutreachDraft, editOutreachDraft, skipOutreachDraft, generateDraftsNow } from "@/app/actions";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";

export default async function OutreachPage() {
  const me = await getCurrentUser();
  if (!canApproveOutreach(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">No access</h1>
        <p className="mt-1 text-sm text-slate-500">The Outreach Queue is for Sharyn + managers.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const [pending, sentDay, approvedCount] = await Promise.all([
    db.outreachDraft.findMany({ where: { status: { in: ["draft", "approved"] } }, orderBy: [{ contactName: "asc" }, { channel: "asc" }] }),
    db.outreachDraft.count({ where: { status: "sent", sentAt: { gte: new Date(Date.now() - 86400000) } } }),
    db.outreachDraft.count({ where: { status: "approved" } }),
  ]);
  type Draft = (typeof pending)[number];

  const groups = new Map<string, Draft[]>();
  for (const d of pending) {
    const arr = groups.get(d.contactId) ?? [];
    arr.push(d);
    groups.set(d.contactId, arr);
  }
  const groupList = Array.from(groups.values());

  const Stat = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
    <div className={`rounded-xl px-4 py-3 ${tone}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">📤 Outreach Queue</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            The Developer Engine drafts intro emails + LinkedIn notes for developers in <Link href="/vetting" className="underline">Buyer Research</Link> who are still &quot;to contact.&quot; Review, edit if you like, then <b>Approve &amp; send</b>. Nothing goes out until you approve it.
          </p>
        </div>
        <form action={generateDraftsNow}>
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">✨ Generate today&apos;s drafts</button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pending review" value={pending.length} tone="bg-amber-50 text-amber-700" />
        <Stat label="LinkedIn to send by hand" value={approvedCount} tone="bg-indigo-50 text-indigo-700" />
        <Stat label="Sent (24h)" value={sentDay} tone="bg-emerald-50 text-emerald-700" />
      </div>

      {groupList.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          Nothing queued. Click <b>Generate today&apos;s drafts</b> to draft outreach for developers marked &quot;to contact&quot; in Buyer Research, or add the 🏗 Developers there first.
        </Card>
      ) : (
        groupList.map((drafts) => (
          <Card key={drafts[0].contactId} className="p-5">
            <SectionTitle title={`${drafts[0].contactName || "(no name)"}${drafts[0].company ? ` · ${drafts[0].company}` : ""}`} />
            <div className="space-y-4">
              {drafts.map((d) => {
                const isEmail = d.channel === "email";
                const approved = d.status === "approved";
                return (
                  <form key={d.id} action={editOutreachDraft} className="rounded-xl border border-slate-200 p-3">
                    <input type="hidden" name="id" value={d.id} />
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${isEmail ? "bg-sky-100 text-sky-700" : "bg-indigo-100 text-indigo-700"}`}>{isEmail ? "📧 Email" : "💼 LinkedIn"}</span>
                      <span className="text-slate-500">{isEmail ? d.toAddress : <a href={d.toAddress} target="_blank" rel="noopener noreferrer" className="underline">Open profile ↗</a>}</span>
                      {approved && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">✓ Approved — send by hand</span>}
                    </div>
                    {isEmail && <input name="subject" defaultValue={d.subject} className={`${inputCls} mb-2 font-semibold`} placeholder="Subject" />}
                    {!isEmail && <input type="hidden" name="subject" value={d.subject} />}
                    <textarea name="body" defaultValue={d.body} rows={isEmail ? 9 : 4} className={`${inputCls} font-mono text-[13px]`} />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!approved && (
                        <button formAction={approveOutreachDraft} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                          {isEmail ? "✅ Approve & send" : "✅ Approve (send by hand)"}
                        </button>
                      )}
                      <button formAction={editOutreachDraft} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">💾 Save edits</button>
                      <button formAction={skipOutreachDraft} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-100">Skip</button>
                    </div>
                  </form>
                );
              })}
            </div>
          </Card>
        ))
      )}

      <p className="text-center text-[11px] text-slate-400">
        Phase 1 · Email sends through your existing email setup on approve; LinkedIn is copy-and-send (no compliant automation). Daily auto-drafting + the developer Finder are next.
      </p>
    </div>
  );
}
