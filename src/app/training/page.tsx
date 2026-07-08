import Link from "next/link";
import { getCurrentUser, isManager, isOwner } from "@/lib/auth";
import { getActiveReps, getSettings } from "@/lib/data";
import { todayStr, friendlyDate } from "@/lib/date";
import { db } from "@/lib/db";
import { positionLabel } from "@/lib/roles";
import { addTrainingFocus, updateTrainingFocus, deleteTrainingFocus, addTrainingSchedule, deleteTrainingSchedule, logCoachingSession, deleteCoachingSession } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";
import AICoach from "@/components/AICoach";
import DevSourcingTrack from "@/components/DevSourcingTrack";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const STATUS_CLS: Record<string, string> = { active: "bg-amber-100 text-amber-700", improving: "bg-sky-100 text-sky-700", mastered: "bg-emerald-100 text-emerald-700" };
const TYPE_LABEL: Record<string, string> = { call_review: "📞 Call review", live_coaching: "🎧 Live coaching", one_on_one: "🧑‍🏫 1:1" };
const CADENCE_LABEL: Record<string, string> = { daily: "Daily", weekly: "Weekly", "mon-fri": "Mon–Fri", "tue-fri": "Tue–Fri", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday" };

// Ready-to-run drills per lane. Acquisitions (Michelle) talk to SELLERS; Dispositions
// (Sharyn, Marie) talk to BUYERS — developers + fix/flippers (often via a gatekeeper).
const DRILL_LANES = [
  {
    key: "acq", emoji: "📞", title: "Acquisitions — seller calls", who: "Michelle · talking to home sellers", cls: "bg-sky-50 ring-sky-200",
    drills: [
      { name: "🤝 Rapport in 60 seconds", how: "First minute only: match their pace, find one genuine personal connection before anything about the house. Record + replay.", win: "Seller is talking freely before you mention price." },
      { name: "🤝 The 3-minute rule (delay the property)", how: "Mock call where you are NOT allowed to mention the house, condition, or price for the FIRST 3 MINUTES. Fill it with THEM — their years there, the area, their plans. Partner buzzes you the second you drift to the property.", win: "3 full minutes of real conversation before a single question about the house." },
      { name: "🤝 Talk less — 60/40", how: "Record a real (or mock) call and time who's talking. The SELLER should talk ~60%, you ~40%. Re-run it until you flip the ratio — one question, then bite your tongue and listen.", win: "The seller is doing most of the talking." },
      { name: "🤝 React, don't advance", how: "Partner reads 8 personal things a seller might say ('my husband passed', 'we raised three kids here', 'job's relocating me'). You must respond with GENUINE empathy + one follow-up ABOUT THEM — never jump to the next scripted question.", win: "Every statement gets a human reaction, not a pivot to the property." },
      { name: "🤝 Name the connection", how: "After 5 mock calls, you have to state the ONE real personal thing you connected on with each seller. Can't name it? You didn't build rapport — run it again.", win: "One genuine connection point you can name for every call." },
      { name: "Motivation dig (5 whys)", how: "Ask 5 layered 'why / what happens if you don't sell' questions until the REAL reason surfaces. Write the one-line motivation.", win: "You can state their true motivation in one sentence." },
      { name: "Offer + silence", how: "Present the number with the range + the reason, then go completely silent. Partner times how long you hold it — aim 10+ sec.", win: "You never talk first after the number." },
      { name: "Objection volley", how: "Partner fires 10 common seller objections rapid-fire ('too low', 'I'll think about it', 'another buyer offered more'). Answer each in under 10 sec.", win: "Calm, ready answer to all 10 — no stumbling." },
      { name: "Close for signature", how: "Drill the transition from verbal yes → 'let's get it signed today' and handle the stall. 5 reps.", win: "Smooth ask for the signature, every time." },
    ],
  },
  {
    key: "ds", emoji: "🤝", title: "Dispositions — buyer / developer calls", who: "Sharyn & Marie · developers + fix/flippers", cls: "bg-violet-50 ring-violet-200",
    drills: [
      { name: "Past the gatekeeper", how: "Role-play 5 ways to reach the decision-maker through a receptionist — credible, specific, not salesy. Track which opener gets you through.", win: "You get the developer/owner on the line (or a direct callback)." },
      { name: "Buy-box in one call", how: "On a single mock call, fill EVERY buy-box field — areas, price range, property type, condition, build type, buying frequency. Time it.", win: "Complete buy box captured, nothing left blank." },
      { name: "30-second deal pitch", how: "Pitch a live deal to a buyer in 30 sec: address, the numbers, and why it fits THEIR box. Cut every wasted word.", win: "Buyer asks a follow-up question — they're interested." },
      { name: "Developer credibility reps", how: "Practice sounding like a pro, not a scammer — reference specific areas/projects, talk lot size & zoning, speak their language for 2 min.", win: "Developer treats you as a peer, not a cold caller." },
      { name: "Flipper objection volley", how: "Partner fires buyer objections ('margin's too thin', 'I'm not buying right now', 'send it over and I'll look'). Answer each in under 10 sec.", win: "You re-engage on every objection instead of hanging up." },
      { name: "Reduction call (Sharyn)", how: "Role-play asking a seller for a price reduction backed by comps + days-on-market — lead with evidence, not apology.", win: "You ask for the reduction with data, no flinching." },
    ],
  },
];

// Suggested coaching method for a focus skill — when to audit calls vs. other drills.
function methodFor(skill: string): string {
  const s = skill.toLowerCase();
  if (/underwrit|comp|mao|number/.test(s)) return "🧮 Deal drills, not call audits — review 2–3 real deals together and re-underwrite live.";
  if (/leadership|manage|girls|team/.test(s)) return "🧑‍🏫 1:1 + role-play — practice the hard conversation, not a recording.";
  if (/gatekeep|receptionist|assertive|developer/.test(s)) return "🎧 Audit gatekeeper calls weekly + role-play the receptionist until the opener lands.";
  if (/rapport|negotiat|objection|close|sign|price|reduction/.test(s)) return "🎧 Audit 1–2 recorded calls/week + live-coach live calls in the moment.";
  return "🎧 Audit a recent call + a short drill on this skill.";
}

export default async function TrainingPage() {
  const me = await getCurrentUser();
  const manager = isManager(me); // Jon + Marie — can edit
  // Eric Cline video course is acquisitions-only — show to acquisitions reps/hires + the owner.
  const showVideoLibrary = isOwner(me) || me?.position === "acquisitions";
  const canView = !!me; // any signed-in team member (incl. onboarding hires) can view; managers edit
  if (!me || !canView) {
    return <Card className="mx-auto max-w-md p-8 text-center"><div className="mb-2 text-3xl">🔒</div><h1 className="text-xl font-bold">Not available</h1><Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link></Card>;
  }
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const [reps, focuses, schedules, sessions] = await Promise.all([
    getActiveReps(),
    db.trainingFocus.findMany({ orderBy: { priority: "asc" } }),
    db.trainingSchedule.findMany({ where: { active: true } }),
    db.coachingSession.findMany({ orderBy: { date: "desc" }, take: 200 }),
  ]);
  // Coaching is for the reps, not the owner — exclude admins (Jon).
  const team = reps.filter((r) => r.position !== "" && r.role !== "admin");
  // Reps only see (and only read) their own plan; managers see + edit everyone.
  const visibleTeam = manager ? team : team.filter((r) => r.id === me.id);
  const focusBy = (id: string) => focuses.filter((f) => f.userId === id);
  const schedBy = (id: string) => schedules.filter((s) => s.userId === id);
  const sessBy = (id: string) => sessions.filter((s) => s.userId === id).slice(0, 6);

  return (
    <div className="space-y-5">
      <SectionTitle title="🎓 Training Portal" subtitle="Per-rep coaching plans, schedule, an AI coaching assistant, and a log of every session." accent="bg-brand-gold"
        right={<Link href="/call-scoring" className="text-sm font-semibold text-brand-navy hover:underline">🎧 Score a call →</Link>} />

      {/* Video training library — external portal (acquisitions sales training). New
          hires: watch every video, take notes. Shared team login shown below.
          Acquisitions-only — dispositions reps don't see it. */}
      {showVideoLibrary && (
      <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy-700 p-5 text-white ring-1 ring-brand-navy">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-brand-gold">🎬 Video Training Library</div>
            <p className="mt-1 max-w-2xl text-sm text-white/75">
              Your first job: <b className="text-white">watch every video</b> in the portal, understand it, and
              <b className="text-white"> take notes</b> on each one. This is the acquisitions sales-training course — the
              foundation for everything you&apos;ll do on the phones.
            </p>
          </div>
          <a href="https://members.theericcline.com/" target="_blank" rel="noopener noreferrer"
            className="shrink-0 rounded-lg bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-navy hover:brightness-105">
            ▶ Open the Training Portal
          </a>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl bg-white/10 px-4 py-3 text-sm ring-1 ring-white/15">
          <span className="text-[11px] font-bold uppercase tracking-wide text-white/50">Team login</span>
          <span><span className="text-white/60">Email:</span> <span className="font-mono font-semibold">jon@freedom-offers.com</span></span>
          <span><span className="text-white/60">Password:</span> <span className="font-mono font-semibold">Ericcline2025</span></span>
        </div>
        <p className="mt-2 text-[11px] text-white/45">Shared login for team training only — don&apos;t share outside Freedom Offers.</p>
      </div>
      )}

      {/* AI coaching assistant — managers run it */}
      {manager && <AICoach reps={team.map((r) => ({ name: r.name, role: r.position, skills: focusBy(r.id).map((f) => f.skill) }))} />}

      {/* Developer Sourcing Track — the dispo team's #1 skill: sign developers + capture buy boxes */}
      <DevSourcingTrack />

      {/* Set weekly training rhythm — what we run each day */}
      <Card className="p-4">
        <div className="mb-1 text-sm font-bold text-slate-700">🗓️ Weekly Training Rhythm</div>
        <p className="mb-3 text-xs text-slate-500">The set cadence for the whole team. Everyone also gets <span className="font-semibold text-emerald-700">daily live coaching</span> — we unmute their live calls and whisper feedback in real time.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {[
            { day: "Mon", emoji: "📞", title: "Call Audit", desc: "Score 2–3 recorded calls each + debrief. Sets the week's focus.", cls: "bg-sky-50 ring-sky-200" },
            { day: "Tue", emoji: "🧮", title: "Underwriting", desc: "MAO / numbers drills. Marie leads; Michelle on offer structuring.", cls: "bg-violet-50 ring-violet-200" },
            { day: "Wed", emoji: "🤝", title: "Rapport & Objections", desc: "Role-play exercises — rapport, gatekeepers, objection handling.", cls: "bg-amber-50 ring-amber-200" },
            { day: "Thu", emoji: "📞", title: "Call Audit #2", desc: "Re-audit targeting the week's weak spot from Monday.", cls: "bg-sky-50 ring-sky-200" },
            { day: "Fri", emoji: "🎯", title: "Closing Drills", desc: "Price negotiation + closing exercises, then week recap.", cls: "bg-emerald-50 ring-emerald-200" },
          ].map((d) => (
            <div key={d.day} className={`rounded-xl p-3 ring-1 ${d.cls}`}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{d.day}</div>
              <div className="mt-0.5 text-sm font-bold text-slate-800">{d.emoji} {d.title}</div>
              <p className="mt-1 text-[11px] leading-snug text-slate-600">{d.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span>🎧 <span className="font-semibold text-emerald-700">Daily:</span> live whisper coaching on real calls (all reps)</span>
          <span>📞 <span className="font-semibold">Call audits:</span> everyone, twice weekly</span>
          <span>🧮 <span className="font-semibold">Underwriting:</span> Marie + Michelle</span>
          <span>🤝 <span className="font-semibold">Rapport:</span> Marie, Sharyn, Michelle</span>
        </div>
      </Card>

      {/* Role-specific drills library — ready-to-run exercises per lane */}
      <Card className="p-4">
        <div className="mb-1 text-sm font-bold text-slate-700">🏋️ Exercises &amp; Drills by role</div>
        <p className="mb-3 text-xs text-slate-500">Ready-to-run reps — repeat them daily/weekly. (Need something tailored to a person or a real call? Use the AI Training Designer above.)</p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {DRILL_LANES.map((lane) => (
            <div key={lane.key} className={`rounded-xl p-3 ring-1 ${lane.cls}`}>
              <div className="mb-0.5 text-sm font-bold text-slate-800">{lane.emoji} {lane.title}</div>
              <div className="mb-2 text-[11px] font-semibold text-slate-500">{lane.who}</div>
              <div className="space-y-2">
                {lane.drills.map((d) => (
                  <div key={d.name} className="rounded-lg bg-white/70 p-2.5 ring-1 ring-slate-200">
                    <div className="text-[13px] font-bold text-slate-800">{d.name}</div>
                    <div className="text-[12px] leading-snug text-slate-600">{d.how}</div>
                    <div className="mt-0.5 text-[11px] text-emerald-700">✅ {d.win}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Weekly schedule board */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-slate-700">🗓 Training schedule</div>
        {schedules.length === 0 ? <p className="text-sm text-slate-400">No sessions scheduled yet — add one on a rep below.</p> : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {schedules.map((s) => {
              const rep = reps.find((r) => r.id === s.userId);
              return (
                <div key={s.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                  <span className="rounded-md bg-brand-navy px-1.5 py-0.5 text-[10px] font-bold text-white">{CADENCE_LABEL[s.cadence] ?? s.cadence}{s.time ? ` · ${s.time}` : ""} · 30 min</span>
                  <div className="min-w-0 flex-1"><div className="font-semibold text-slate-700">{rep?.name?.split(" ")[0] ?? "—"}</div><div className="text-xs text-slate-500">{s.focus}</div></div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Coaching-method guide — when to audit calls vs. other drills */}
      <Card className="p-4">
        <div className="mb-1 text-sm font-bold text-slate-700">💡 When to audit calls vs. other coaching</div>
        <p className="mb-2 text-xs text-slate-500">All sessions are 30 min — pick the method that fits the skill so you&apos;re not just listening to recordings for everything.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-2.5 text-sm ring-1 ring-slate-200">
            <div className="font-bold text-emerald-700">🎧 Audit recordings when…</div>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              <li>• It shows up on a <b>call</b> — rapport, objection handling, negotiating, the close, the developer gatekeeper.</li>
              <li>• Cadence: <b>1–2 calls/week per rep</b> — their best + their worst, not every call.</li>
              <li>• Pick calls that <b>didn&apos;t convert</b> (offer that didn&apos;t sign, gatekeeper that blocked) — that&apos;s where the lesson is.</li>
              <li>• Score it in <Link href="/call-scoring" className="underline">Call Scoring</Link> first, then debrief from the score.</li>
            </ul>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5 text-sm ring-1 ring-slate-200">
            <div className="font-bold text-sky-700">🧠 Use a different method when…</div>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              <li>• <b>Underwriting / numbers</b> (Marie) → 🧮 review 2–3 real deals and re-underwrite live, not a recording.</li>
              <li>• <b>Leadership</b> (Marie) → 🧑‍🏫 1:1 + role-play the hard conversation.</li>
              <li>• <b>Rapport / closing</b> (Michelle) → 🎧 live-coach her live calls in the moment, then audit one after.</li>
              <li>• <b>On-the-spot habits</b> → drill a 5-minute rep before the shift, not a 30-min review.</li>
            </ul>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Each focus skill below shows its suggested method automatically.</p>
      </Card>

      {/* Per-rep coaching plans */}
      {visibleTeam.map((rep) => {
        const repFocuses = focusBy(rep.id);
        const repSched = schedBy(rep.id);
        const repSess = sessBy(rep.id);
        return (
          <Card key={rep.id} className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-slate-800">{rep.name}</span>
              <span className="text-xs text-slate-400">{positionLabel(rep.position)}</span>
              {repSched.map((s) => <span key={s.id} className="rounded-full bg-brand-gold/20 px-2 py-0.5 text-[11px] font-semibold text-brand-navy">{CADENCE_LABEL[s.cadence] ?? s.cadence}{s.time ? ` ${s.time}` : ""} · 30 min</span>)}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Focus skills */}
              <div>
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">🎯 Focus skills</div>
                <div className="space-y-1.5">
                  {repFocuses.length === 0 && <div className="text-xs text-slate-400">No focus areas yet.</div>}
                  {repFocuses.map((f, i) => (
                    <div key={f.id} className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-navy text-[10px] font-bold text-white">{i + 1}</span>
                        <span className="flex-1 text-sm font-semibold text-slate-700">{f.skill}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLS[f.status] ?? "bg-slate-100"}`}>{f.status}</span>
                        {manager && <form action={deleteTrainingFocus}><input type="hidden" name="id" value={f.id} /><button className="text-slate-300 hover:text-red-600">×</button></form>}
                      </div>
                      {f.notes && <div className="mt-0.5 pl-7 text-xs text-slate-500">{f.notes}</div>}
                      <div className="mt-0.5 pl-7 text-[11px] text-emerald-700">{methodFor(f.skill)}</div>
                      {manager && (
                      <form action={updateTrainingFocus} className="mt-1 flex items-center gap-1.5 pl-7">
                        <input type="hidden" name="id" value={f.id} />
                        <select name="status" defaultValue={f.status} className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]">
                          <option value="active">active</option><option value="improving">improving</option><option value="mastered">mastered</option>
                        </select>
                        <button className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-300">update</button>
                      </form>
                      )}
                    </div>
                  ))}
                </div>
                {manager && (
                <form action={addTrainingFocus} className="mt-2 space-y-1.5">
                  <input type="hidden" name="userId" value={rep.id} />
                  <input name="skill" placeholder="Add a focus skill…" required className={inputCls} />
                  <div className="flex gap-1.5">
                    <input name="notes" placeholder="note (optional)" className={inputCls} />
                    <button className="shrink-0 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">+ Add</button>
                  </div>
                </form>
                )}
                {/* Schedule editing */}
                {manager && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-brand-navy">🗓 Edit schedule</summary>
                  <div className="mt-1 space-y-1">
                    {repSched.map((s) => <div key={s.id} className="flex items-center gap-2 text-xs text-slate-500"><span className="flex-1">{CADENCE_LABEL[s.cadence] ?? s.cadence}{s.time ? ` ${s.time}` : ""} — {s.focus}</span><form action={deleteTrainingSchedule}><input type="hidden" name="id" value={s.id} /><button className="text-slate-300 hover:text-red-600">×</button></form></div>)}
                  </div>
                  <form action={addTrainingSchedule} className="mt-1 flex flex-wrap items-end gap-1.5">
                    <input type="hidden" name="userId" value={rep.id} />
                    <select name="cadence" defaultValue="weekly" className="rounded border border-slate-300 px-1.5 py-1 text-xs"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="mon-fri">Mon–Fri</option><option value="tue-fri">Tue–Fri</option><option value="mon">Monday</option><option value="tue">Tuesday</option><option value="wed">Wednesday</option><option value="thu">Thursday</option><option value="fri">Friday</option></select>
                    <input name="time" placeholder="9:30 AM" className="w-20 rounded border border-slate-300 px-1.5 py-1 text-xs" />
                    <input name="focus" placeholder="what it covers" required className="min-w-32 flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs" />
                    <button className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white">+</button>
                  </form>
                </details>
                )}
              </div>

              {/* Coaching log */}
              <div>
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">🧑‍🏫 Coaching log</div>
                {manager && (
                <form action={logCoachingSession} className="space-y-1.5 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                  <input type="hidden" name="userId" value={rep.id} />
                  <div className="flex gap-1.5">
                    <input type="date" name="date" defaultValue={today} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
                    <select name="type" defaultValue="call_review" className="flex-1 rounded border border-slate-300 px-1.5 py-1 text-xs"><option value="call_review">📞 Call review</option><option value="live_coaching">🎧 Live coaching</option><option value="one_on_one">🧑‍🏫 1:1</option></select>
                    <select name="rating" defaultValue="" className="rounded border border-slate-300 px-1.5 py-1 text-xs"><option value="">rate</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}★</option>)}</select>
                  </div>
                  <input name="skill" placeholder="skill worked on (e.g. rapport)" className={inputCls} />
                  <textarea name="notes" placeholder="What happened / what to fix…" rows={2} required className={inputCls} />
                  <div className="flex gap-1.5">
                    <input name="nextStep" placeholder="next step" className={inputCls} />
                    <button className="shrink-0 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy-700">Log</button>
                  </div>
                </form>
                )}
                <div className="mt-2 space-y-1.5">
                  {repSess.length === 0 && <div className="text-xs text-slate-400">No sessions logged yet.</div>}
                  {repSess.map((s) => (
                    <div key={s.id} className="rounded-lg border border-slate-100 p-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-600">{TYPE_LABEL[s.type] ?? s.type}</span>
                        {s.skill && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{s.skill}</span>}
                        {s.rating != null && <span className="text-amber-500">{"★".repeat(s.rating)}</span>}
                        <span className="ml-auto text-[10px] text-slate-300">{friendlyDate(s.date)}</span>
                        {manager && <form action={deleteCoachingSession}><input type="hidden" name="id" value={s.id} /><button className="text-slate-300 hover:text-red-600">×</button></form>}
                      </div>
                      <div className="mt-0.5 text-slate-600">{s.notes}</div>
                      {s.nextStep && <div className="mt-0.5 text-emerald-700">→ {s.nextStep}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
