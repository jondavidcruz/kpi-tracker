import Link from "next/link";
import { saveMeetingSettings, saveTrainingTip, deleteTrainingTip, addMeetingNote, deleteMeetingNote, addRecording, deleteRecording, addMeetingHighlight, deleteMeetingHighlight, saveDeckImages, addDeckSlide, updateDeckSlide, deleteDeckSlide } from "@/app/actions";
import ImageUpload from "@/components/ImageUpload";
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

export default async function MeetingPage({ searchParams }: { searchParams: Promise<{ saved?: string; err?: string }> }) {
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
  const [settings, kpis, tips, notes, recordings, highlights, deckSlides] = await Promise.all([
    getSettings(),
    getKpis(),
    db.trainingTip.findMany({ orderBy: { createdAt: "desc" } }),
    db.meetingNote.findMany({ where: { meeting: "monday" }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.meetingRecording.findMany({ where: { meeting: "monday" }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.meetingHighlight.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    db.deckSlide.findMany({ orderBy: { sortOrder: "asc" } }),
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
        title="🗓 Monday Meeting — 30 min"
        subtitle="One-click all-call deck — live from your KPIs. Keep it to 30 minutes: hit the highlights, don't read every number."
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

      {/* Slides & photos — swap the title/team images + add your own slides, no code. */}
      <div id="slides" className="scroll-mt-4 border-t border-slate-200 pt-6">
        <SectionTitle title="🖼️ Slides & Photos" subtitle="Swap the Title + Team photos and add your own slides yourself — no code needed. Changes show on the deck above." accent="bg-violet-400" />
        {(sp.saved === "Slide images" || sp.saved === "Slide added") && <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}
        {(sp.err === "noimage" || sp.err === "notext") && <div className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-200">{sp.err === "noimage" ? "Upload an image first." : "Add a title or some text first."}</div>}

        <Card className="p-5">
          <form action={saveDeckImages} className="space-y-4">
            <div>
              <div className="mb-1 text-sm font-bold text-slate-700">Title / hero slide (slide 1)</div>
              <ImageUpload name="titleSlideUrl" current={settings.titleSlideUrl} label="Upload title image" />
            </div>
            <div>
              <div className="mb-1 text-sm font-bold text-slate-700">Team slide (slide 2)</div>
              <p className="mb-1 text-[11px] text-slate-400">Upload a full team image to replace the built-in grid — or leave blank to keep the auto layout (which already fits all 8).</p>
              <ImageUpload name="teamSlideUrl" current={settings.teamSlideUrl} label="Upload team image" />
            </div>
            <button className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-700">Save slide images</button>
          </form>
        </Card>

        <Card className="mt-3 p-5">
          <div className="mb-2 text-sm font-bold text-slate-700">➕ Add your own slide</div>
          <form action={addDeckSlide} className="space-y-3">
            <div className="flex gap-4 text-sm text-slate-600">
              <label className="flex items-center gap-1.5"><input type="radio" name="kind" value="image" defaultChecked /> 🖼️ Image slide</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="kind" value="text" /> 📝 Text slide</label>
            </div>
            <input name="title" placeholder="Slide title / caption (shows on the slide)" className={inputCls} />
            <textarea name="body" rows={3} placeholder="Body text (shows on the slide — under the title, or as a caption over your photo)" className={inputCls} />
            <p className="text-[11px] text-slate-400">Title + body now show on <b>both</b> slide types — on a photo they appear as a caption across the bottom. Upload an image only for an Image slide.</p>
            <ImageUpload name="imageUrl" label="Upload slide image" />
            <button className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">+ Add slide</button>
          </form>
        </Card>

        {deckSlides.length > 0 && (
          <Card className="mt-3 p-5">
            <div className="mb-2 text-sm font-bold text-slate-700">Your slides <span className="font-normal text-slate-400">(shown right after the team slide, in this order)</span></div>
            <div className="space-y-2">
              {deckSlides.map((slide, i) => (
                <div key={slide.id} className={`flex items-center gap-2 rounded-lg border p-2 ${slide.active ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-60"}`}>
                  {slide.imageUrl ? <img src={slide.imageUrl} alt="" className="h-10 w-16 rounded object-cover" /> : <span className="grid h-10 w-16 place-items-center rounded bg-brand-navy text-xs font-bold text-white">Aa</span>}
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{slide.kind === "text" ? "📝" : "🖼️"} {slide.title || (slide.kind === "text" ? "Text slide" : "Image slide")}{!slide.active && <span className="ml-1 text-[11px] text-slate-400">(hidden)</span>}</span>
                  <form action={updateDeckSlide}><input type="hidden" name="id" value={slide.id} /><input type="hidden" name="op" value="up" /><button disabled={i === 0} className="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button></form>
                  <form action={updateDeckSlide}><input type="hidden" name="id" value={slide.id} /><input type="hidden" name="op" value="down" /><button disabled={i === deckSlides.length - 1} className="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button></form>
                  <form action={updateDeckSlide}><input type="hidden" name="id" value={slide.id} /><input type="hidden" name="op" value="toggle" /><button className="rounded px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">{slide.active ? "Hide" : "Show"}</button></form>
                  <form action={deleteDeckSlide}><input type="hidden" name="id" value={slide.id} /><button className="rounded px-2 py-0.5 text-[11px] font-semibold text-red-400 hover:text-red-600">Delete</button></form>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Edit content — lives on the same page; the team only sees the fullscreen Present view. */}
      <div id="edit" className="scroll-mt-4 border-t border-slate-200 pt-6">
        <SectionTitle title="✏️ Edit deck content" subtitle="Editorial slides + the training-tip backlog" accent="bg-slate-300" />

        {sp.saved && (
          <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
            ✓ Saved “{sp.saved}”.
          </div>
        )}

        <Card className="p-6">
          <form action={saveMeetingSettings} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 ring-1 ring-slate-200">
              🎯 The annual goal is fixed for the year and shown on the Annual Goal slide — it&apos;s set once and not editable here on purpose. The progress bar still updates live from closed deals.
            </div>
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
