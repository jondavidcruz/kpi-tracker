import Link from "next/link";
import { saveLeadershipSettings, addMeetingNote, deleteMeetingNote } from "@/app/actions";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { getLeadershipDeck, getL10 } from "@/lib/meeting";
import { todayStr } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";
import LeadershipDeckView from "@/components/LeadershipDeck";
import L10Agenda from "@/components/L10Agenda";
import RecordingsCard from "@/components/RecordingsCard";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

export default async function LeadershipPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <p className="mt-2 text-sm text-slate-500">This meeting page is private to the owner.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const [settings, notes, recordings] = await Promise.all([
    getSettings(),
    db.meetingNote.findMany({ where: { meeting: "leadership" }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.meetingRecording.findMany({ where: { meeting: "leadership" }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const today = todayStr(settings.orgTimezone);
  const [deck, l10] = await Promise.all([getLeadershipDeck(today), getL10(today)]);
  const fmtWhen = (d: Date) => new Intl.DateTimeFormat("en-US", {
    timeZone: settings.orgTimezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(d);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="👔 Leadership Meeting"
        subtitle="Run the EOS Level 10 agenda below — Scorecard, Rocks, To-Dos, and issues to solve, all live."
        accent="bg-brand-navy"
        right={
          <div className="flex items-center gap-3">
            {settings.leadershipMeetLink && <a href={settings.leadershipMeetLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">🎥 Join Meet</a>}
            <a href="#edit" className="text-sm font-semibold text-brand-navy hover:underline">Edit content ↓</a>
          </div>
        }
      />

      {/* EOS Level 10 Meeting — the live 90-min agenda runner */}
      <L10Agenda l10={l10} />

      {/* Present-mode deck (screen-share slides) */}
      <div className="border-t border-slate-200 pt-5">
        <SectionTitle title="🖥 Present mode" subtitle="Full-screen slides for screen-sharing the snapshot" accent="bg-slate-300" />
        <LeadershipDeckView deck={deck} />
      </div>

      {/* Recordings archive (Fathom links) */}
      <RecordingsCard meeting="leadership" recordings={recordings} fmtWhen={fmtWhen} />


      {/* Meeting notes */}
      <div id="notes" className="scroll-mt-4">
        <Card className="p-6">
          <h3 className="mb-1 text-sm font-bold text-slate-700">📝 Meeting notes</h3>
          <p className="mb-3 text-xs text-slate-500">Decisions and feedback from the leadership meeting. Saved to a running log below.</p>
          <form action={addMeetingNote} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="meeting" value="leadership" />
            <input name="text" placeholder="Add a note or decision…" className={`${inputCls} flex-1`} required />
            <button className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save note</button>
          </form>
          {notes.length > 0 && (
            <ul className="mt-4 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
                  <div className="flex-1">
                    <div className="text-sm text-slate-700">{n.text}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{n.author || "—"} · {fmtWhen(n.createdAt)}</div>
                  </div>
                  <form action={deleteMeetingNote}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="meeting" value="leadership" />
                    <button className="text-xs font-medium text-slate-400 hover:text-red-600">Delete</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Edit content */}
      <div id="edit" className="scroll-mt-4 border-t border-slate-200 pt-6">
        <SectionTitle title="✏️ Edit deck content" subtitle="Agenda, discussion points, and decisions / action items" accent="bg-slate-300" />
        {sp.saved && (
          <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
            ✓ Saved “{sp.saved}”.
          </div>
        )}
        <Card className="p-6">
          <form action={saveLeadershipSettings} className="grid grid-cols-1 gap-5">
            <label>
              <span className={labelCls}>Agenda (one per line)</span>
              <textarea name="leadAgenda" defaultValue={settings.leadAgenda} rows={4} placeholder={"Numbers review\nHiring / staffing\nProcess changes\n…"} className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Discussion / Talking Points (one per line)</span>
              <textarea name="mtgTalkingPoints" defaultValue={settings.mtgTalkingPoints} rows={4} className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Decisions &amp; Action Items (one per line)</span>
              <textarea name="leadActionItems" defaultValue={settings.leadActionItems} rows={4} className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>🎥 Google Meet link (Join button)</span>
              <input name="leadershipMeetLink" defaultValue={settings.leadershipMeetLink} placeholder="https://meet.google.com/…" className={inputCls} />
            </label>
            <div>
              <button className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-700">Save deck content</button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
