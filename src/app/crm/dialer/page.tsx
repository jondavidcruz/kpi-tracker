import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { commsFor } from "@/lib/crm-comms";
import { Card, SectionTitle } from "@/components/ui";
import BrowserDialer from "@/components/BrowserDialer";
import TelnyxCallButton from "@/components/TelnyxCallButton";
import { dialerOutcomeAction } from "../actions";

export const dynamic = "force-dynamic";

// ☎️ Power dialer (Close-style): one screen, the day's call queue in priority
// order — due follow-ups first, then due tasks' leads, then quiet leads.
// Call → pick an outcome → it logs, reschedules, and serves the next lead.
export default async function DialerPage({ searchParams }: { searchParams: Promise<{ i?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">The dialer is for acquisitions + managers.</Card>;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const manager = isManager(me!);
  const comms = await commsFor(me!);
  const mine = manager ? {} : { assignedTo: { equals: me!.name, mode: "insensitive" as const } };

  const [due, quiet] = await Promise.all([
    db.crmOpportunity.findMany({
      where: { archivedAt: null, ...mine, nextFollowUp: { not: "", lte: today }, stage: { notIn: ["dead", "signed"] } },
      include: { contact: true }, orderBy: { nextFollowUp: "asc" }, take: 60,
    }),
    db.crmOpportunity.findMany({
      where: { archivedAt: null, ...mine, nextFollowUp: "", stage: { notIn: ["dead", "signed", "nurture"] }, updatedAt: { lte: new Date(Date.now() - 3 * 86400000) } },
      include: { contact: true }, orderBy: { updatedAt: "asc" }, take: 30,
    }),
  ]);
  const seen = new Set<string>();
  const queue = [...due, ...quiet].filter((o) => o.contact.phone && !seen.has(o.id) && (seen.add(o.id), true));
  const i = Math.min(Math.max(0, Number(sp.i) || 0), Math.max(0, queue.length - 1));
  const cur = queue[i];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="☎️ Power Dialer"
        subtitle="Your call queue, priority-ordered: due follow-ups → quiet leads. Call, log the outcome, next."
        accent="bg-emerald-500"
        right={<Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">← Pipeline</Link>}
      />

      {!cur ? (
        <Card className="p-12 text-center">
          <div className="text-3xl">🎉</div>
          <div className="mt-2 text-sm font-bold text-slate-700">Queue cleared — every due lead has been worked.</div>
          <p className="mt-1 text-xs text-slate-400">New follow-ups land here automatically as they come due.</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">call {i + 1} of {queue.length}</span>
            <span className="hidden text-slate-400 sm:inline">{queue.slice(i + 1, i + 5).map((o) => o.contact.name.split(" ")[0]).join(" → ")}{queue.length > i + 5 ? " → …" : ""}</span>
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-[240px] flex-1">
                <div className="text-xl font-extrabold tracking-tight text-slate-900">{cur.contact.name}</div>
                <div className="text-sm text-slate-500">{cur.title}</div>
                <div className="mt-1 text-lg font-bold text-brand-navy">{cur.contact.phone}</div>
                {cur.contact.pinnedNote && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">📌 {cur.contact.pinnedNote}</div>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {comms.call && <BrowserDialer oppId={cur.id} contactId={cur.contactId} phone={cur.contact.phone} />}
                  {comms.call && <TelnyxCallButton oppId={cur.id} contactId={cur.contactId} phone={cur.contact.phone} />}
                  <Link href={`/crm/${cur.id}`} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">📂 Full card</Link>
                </div>
              </div>
              <LastNotes contactId={cur.contactId} />
            </div>

            <form action={dialerOutcomeAction} className="mt-4 border-t border-slate-100 pt-3">
              <input type="hidden" name="oppId" value={cur.id} />
              <input type="hidden" name="contactId" value={cur.contactId} />
              <input type="hidden" name="next" value={i} />
              <input name="note" placeholder="what they said… (optional)" className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
              <div className="flex flex-wrap gap-1.5">
                <button name="outcome" value="no_answer" className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">📵 No answer <span className="font-normal text-slate-400">(+1d)</span></button>
                <button name="outcome" value="voicemail" className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">📼 Voicemail <span className="font-normal text-slate-400">(+2d)</span></button>
                <button name="outcome" value="callback" className="rounded-xl bg-amber-100 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-200">📞 Callback today</button>
                <button name="outcome" value="talked" className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700">✅ Talked <span className="font-normal text-emerald-100">(+3d)</span></button>
                <button name="outcome" value="not_interested" className="rounded-xl bg-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-300">🌱 Not interested → nurture</button>
                <Link href={`/crm/dialer?i=${i + 1}`} className="ml-auto rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-slate-400 ring-1 ring-slate-200 hover:text-slate-600">skip →</Link>
              </div>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

async function LastNotes({ contactId }: { contactId: string }) {
  const events = await db.crmEvent.findMany({ where: { contactId }, orderBy: { at: "desc" }, take: 4 });
  return (
    <div className="w-full max-w-sm space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Last activity</div>
      {events.map((e) => (
        <div key={e.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 ring-1 ring-slate-100">
          <span className="font-bold">{e.kind}:</span> {e.body.slice(0, 110)}
          <span className="ml-1 text-[9px] text-slate-400">{e.at.toLocaleDateString()}</span>
        </div>
      ))}
      {events.length === 0 && <div className="text-[11px] text-slate-400">No history yet — fresh lead.</div>}
    </div>
  );
}
