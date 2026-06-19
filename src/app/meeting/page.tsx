import Link from "next/link";
import { saveMeetingSettings, saveTrainingTip, deleteTrainingTip, addMeetingNote, deleteMeetingNote, addRecording, deleteRecording, addMeetingHighlight, deleteMeetingHighlight } from "@/app/actions";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings, getKpis } from "@/lib/data";
import { db } from "@/lib/db";
import { getMeetingDeck, buildMeetingSummary } from "@/lib/meeting";
import { todayStr } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";
import MeetingDeckView from "@/components/MeetingDeck";
import RecordingsCard from "@/components/RecordingsCard";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

export default async function MeetingPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const [settings, kpis, tips, notes, recordings, highlights] = await Promise.all([
    getSettings(),
    getKpis(),
    db.trainingTip.findMany({ orderBy: { createdAt: "desc" } }),
    db.meetingNote.findMany({ where: { meeting: "monday" }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.meetingRecording.findMany({ where: { meeting: "monday" }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.meetingHighlight.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
  ]);
  const greenKpis = kpis.filter((k) => k.scope === "per_rep" && k.category === "green");
  const today = todayStr(settings.orgTimezone);
  const deck = await getMeetingDeck(today);
  const summary = await buildMeetingSummary(today, deck);
  const summarySections: { title: string; items: string[] }[] = [
    { title: "🏆 Wins & highlights", items: summary.wins },
    { title: "📊 The numbers (vs last week)", items: summary.numbers },
    { title: "⚠️ Needs attention", items: summary.attention },
    { title: "🏠 Pipeline & closings", items: summary.pipeline },
    { title: "🎯 Focus this week", items: summary.focus },
    { title: "🙌 Accountability & shout-outs", items: summary.shoutouts },
  ];
  const fmtWhen = (d: Date) => new Intl.DateTimeFormat("en-US", {
    timeZone: settings.orgTimezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(d);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗓 Monday Meeting"
        subtitle="One-click all-call deck — live from your KPIs. Hit Present for full screen; edit the content below."
        accent="bg-brand-gold"
        right={
          <div className="flex items-center gap-3">
            {settings.teamMeetLink && <a href={settings.teamMeetLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">🎥 Join Meet</a>}
            <a href="#edit" className="text-sm font-semibold text-brand-navy hover:underline">Edit content ↓</a>
          </div>
        }
      />

      {/* Auto talking points — same structure every week, content changes. Your script. */}
      <Card className="p-5 ring-2 ring-brand-gold/30">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-base font-extrabold text-slate-800">🎤 This week&apos;s talking points</span>
          <span className="text-xs text-slate-400">{summary.weekLabel} · auto-generated</span>
        </div>
        <p className="mb-3 text-xs text-slate-500">Same six sections every week — read down the list. Numbers pull live; you don&apos;t have to prep.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {summarySections.filter((s) => s.items.length > 0).map((s) => (
            <div key={s.title} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="mb-1 text-xs font-bold text-slate-600">{s.title}</div>
              <ul className="space-y-1 text-sm text-slate-700">{s.items.map((it, i) => <li key={i} className="flex gap-1.5"><span className="text-slate-300">•</span><span>{it}</span></li>)}</ul>
            </div>
          ))}
        </div>
      </Card>

      {/* Highlights log — persistent wins, kept separate from the auto KPI sheets */}
      <Card className="p-5">
        <div className="mb-1 text-base font-bold text-slate-800">🌟 Highlights log</div>
        <p className="mb-3 text-xs text-slate-500">Lasting wins & milestones — these stay here week to week, separate from the live KPI sheets. Add one whenever something good happens.</p>
        <form action={addMeetingHighlight} className="mb-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="weekOf" value={today} />
          <input name="text" placeholder="e.g. Closed the Hutchins deal for $20k — biggest of the quarter" className={`${inputCls} min-w-64 flex-1`} required />
          <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">+ Add highlight</button>
        </form>
        {highlights.length === 0 ? (
          <p className="text-sm text-slate-400">No highlights yet — add your first win above.</p>
        ) : (
          <ul className="space-y-1">
            {highlights.map((hl) => (
              <li key={hl.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                <span className="text-amber-500">🌟</span>
                <span className="text-slate-700">{hl.text}</span>
                <span className="text-[10px] text-slate-300">{new Date(hl.createdAt).toLocaleDateString()}{hl.addedBy ? ` · ${hl.addedBy.split(" ")[0]}` : ""}</span>
                <form action={deleteMeetingHighlight} className="ml-auto"><input type="hidden" name="id" value={hl.id} /><button className="text-[11px] text-slate-300 hover:text-red-600">remove</button></form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <MeetingDeckView deck={deck} />

      {/* Recordings archive (Fathom links) */}
      <RecordingsCard meeting="monday" recordings={recordings} fmtWhen={fmtWhen} />


      {/* Meeting notes — capture feedback live during the meeting. */}
      <div id="notes" className="scroll-mt-4">
        <Card className="p-6">
          <h3 className="mb-1 text-sm font-bold text-slate-700">📝 Meeting notes</h3>
          <p className="mb-3 text-xs text-slate-500">Jot down feedback as it comes up. Saved to a running log below.</p>
          <form action={addMeetingNote} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="meeting" value="monday" />
            <input name="text" placeholder="Add a note or piece of feedback…" className={`${inputCls} flex-1`} required />
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
                    <input type="hidden" name="meeting" value="monday" />
                    <button className="text-xs font-medium text-slate-400 hover:text-red-600">Delete</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Edit content — lives on the same page; the team only sees the fullscreen Present view. */}
      <div id="edit" className="scroll-mt-4 border-t border-slate-200 pt-6">
        <SectionTitle title="✏️ Edit deck content" subtitle="Annual goal, editorial slides, and the training-tip backlog" accent="bg-slate-300" />

        {sp.saved && (
          <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
            ✓ Saved “{sp.saved}”.
          </div>
        )}

        <Card className="p-6">
          <form action={saveMeetingSettings} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label>
              <span className={labelCls}>Annual revenue goal ($)</span>
              <input name="annualRevenueGoal" defaultValue={settings.annualRevenueGoal || ""} placeholder="500000" className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Homeowners to help (mission)</span>
              <input name="homeownersGoal" defaultValue={settings.homeownersGoal || ""} placeholder="24" className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Goal reward / incentive</span>
              <input name="goalReward" defaultValue={settings.goalReward} placeholder="Boracay / Cebu trip + $250 VA bonus" className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Stretch revenue goal ($)</span>
              <input name="revenueStretchGoal" defaultValue={settings.revenueStretchGoal || ""} placeholder="600000" className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Stretch reward / incentive</span>
              <input name="stretchReward" defaultValue={settings.stretchReward} placeholder="+$250 additional VA bonus" className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Team Announcements (one per line)</span>
              <textarea name="mtgAnnouncements" defaultValue={settings.mtgAnnouncements} rows={4} placeholder={"New script live\nUpdated underwriting process\n…"} className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Change / Coming Soon (one per line)</span>
              <textarea name="mtgComingSoon" defaultValue={settings.mtgComingSoon} rows={4} className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>🎥 Monday meeting — Google Meet link (Join button)</span>
              <input name="teamMeetLink" defaultValue={settings.teamMeetLink} placeholder="https://meet.google.com/…" className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>🎥 Daily huddle — Google Meet link (Join button on the Huddle page)</span>
              <input name="huddleMeetLink" defaultValue={settings.huddleMeetLink} placeholder="https://meet.google.com/…" className={inputCls} />
            </label>
            <div className="sm:col-span-2">
              <button className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-700">Save deck content</button>
            </div>
          </form>
        </Card>

        <Card className="mt-4 p-6">
          <h3 className="mb-1 text-sm font-bold text-slate-700">Training-tip backlog</h3>
          <p className="mb-3 text-xs text-slate-500">Each Monday the deck shows the tip matching the team&apos;s weakest KPI; untagged tips rotate as the general fallback.</p>
          <div className="mb-4 space-y-2">
            {tips.length === 0 && <p className="text-sm text-slate-400">No tips yet — add your first below.</p>}
            {tips.map((t) => (
              <div key={t.id} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
                <span className="mt-0.5 shrink-0 rounded-md bg-brand-navy px-1.5 py-0.5 text-[10px] font-semibold text-white">{t.kpiKey || "general"}</span>
                <span className="flex-1 text-sm text-slate-700">{t.text}</span>
                <form action={deleteTrainingTip}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-xs font-medium text-slate-400 hover:text-red-600">Delete</button>
                </form>
              </div>
            ))}
          </div>
          <form action={saveTrainingTip} className="grid grid-cols-1 gap-2 sm:grid-cols-6">
            <input name="text" placeholder="New training tip…" className={`${inputCls} sm:col-span-4`} required />
            <select name="kpiKey" defaultValue="" className={`${inputCls} sm:col-span-1`}>
              <option value="">general</option>
              {greenKpis.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
            </select>
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 sm:col-span-1">+ Add tip</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
