import Link from "next/link";
import type { L10 } from "@/lib/meeting";
import { Card } from "@/components/ui";

const ROCK_PILL: Record<string, string> = {
  on_track: "bg-emerald-100 text-emerald-700",
  off_track: "bg-red-100 text-red-700",
  done: "bg-sky-100 text-sky-700",
};

function Seg({ n, title, mins, children, href, hrefLabel }: {
  n: number; title: string; mins: number; children: React.ReactNode; href?: string; hrefLabel?: string;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-navy text-xs font-bold text-brand-gold-soft">{n}</span>
        <h3 className="flex-1 text-sm font-bold text-slate-800">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{mins} min</span>
        {href && <Link href={href} className="text-[11px] font-semibold text-brand-navy hover:underline">{hrefLabel} →</Link>}
      </div>
      <div className="pl-9">{children}</div>
    </Card>
  );
}

export default function L10Agenda({ l10 }: { l10: L10 }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-900">📋 Level 10 Meeting</h2>
        <span className="rounded-full bg-brand-gold/20 px-2.5 py-0.5 text-xs font-semibold text-brand-navy">Same day, same time, 90 min, same agenda</span>
        <span className="ml-auto text-xs text-slate-400">{l10.generatedOn} · {l10.quarterLabel}</span>
      </div>

      <Seg n={1} title="Segue" mins={5}>
        <p className="text-sm text-slate-500">Round the table — one piece of <strong>good news</strong> each, personal and business. Transition into work mode.</p>
      </Seg>

      <Seg n={2} title="Scorecard" mins={5} href="/dashboard" hrefLabel="Full dashboard">
        {l10.scorecard.length === 0
          ? <p className="text-sm text-slate-400">No weekly numbers yet.</p>
          : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {l10.scorecard.map((g) => (
                <div key={g.key} className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{g.name}</div>
                  <div className="text-lg font-bold text-slate-800">{g.value}</div>
                </div>
              ))}
            </div>}
        <p className="mt-2 text-xs text-slate-500">Each owner: on-track or off-track? Off-track numbers become an issue — drop them down to IDS.</p>
      </Seg>

      <Seg n={3} title="Rock Review" mins={5} href="/rocks" hrefLabel="Rocks board">
        <div className="mb-2 flex gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">{l10.rocks.onTrack} on track</span>
          {l10.rocks.offTrack > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{l10.rocks.offTrack} off track</span>}
          <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">{l10.rocks.done} done</span>
        </div>
        {l10.rocks.list.length === 0
          ? <p className="text-sm text-slate-400">No rocks set for this quarter yet.</p>
          : <ul className="space-y-1">
              {l10.rocks.list.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${ROCK_PILL[r.status] ?? ROCK_PILL.on_track}`}>{r.status.replace("_", " ")}</span>
                  <span className="flex-1 text-slate-700">{r.title}</span>
                  <span className="text-xs text-slate-400">{r.owner} · {r.progress}%</span>
                </li>
              ))}
            </ul>}
        <p className="mt-2 text-xs text-slate-500">Off-track Rock? Don&apos;t solve it here — drop it to the Issues list for IDS.</p>
      </Seg>

      <Seg n={4} title="Customer / Employee Headlines" mins={5}>
        <p className="text-sm text-slate-500">Quick bullet headlines — wins, concerns, anything the team should know. No discussion; anything that needs solving becomes an issue.</p>
      </Seg>

      <Seg n={5} title="To-Do List" mins={5} href="/issues" hrefLabel="Open list">
        <div className="mb-2 flex items-center gap-2">
          <div className="relative h-2 w-40 overflow-hidden rounded-full bg-slate-200">
            <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${l10.todos.donePct}%` }} />
          </div>
          <span className="text-xs font-semibold text-slate-500">{l10.todos.donePct}% done · target 90%</span>
        </div>
        {l10.todos.list.length === 0
          ? <p className="text-sm text-slate-400">No open to-dos.</p>
          : <ul className="space-y-0.5">
              {l10.todos.list.map((t, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="text-slate-300">☐</span><span className="flex-1">{t.text}</span>
                  <span className="text-xs text-slate-400">{t.owner}{t.dueDate ? ` · ${t.dueDate.slice(5)}` : ""}</span>
                </li>
              ))}
            </ul>}
      </Seg>

      <Seg n={6} title="IDS — Identify, Discuss, Solve" mins={60} href="/issues" hrefLabel="Issues list">
        <p className="mb-2 text-sm text-slate-500">The heart of the meeting. Prioritize the top 3, then solve #1 all the way through before moving on.</p>
        {l10.issues.length === 0
          ? <p className="text-sm text-slate-400">No open issues. 🎉</p>
          : <ol className="space-y-1">
              {l10.issues.map((iss, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  {i < 3 && <span className="rounded-full bg-brand-gold px-1.5 py-0.5 text-[10px] font-bold text-brand-navy">#{i + 1}</span>}
                  <span className="flex-1 text-slate-700">{iss.title}</span>
                  <span className="text-xs text-slate-400">{iss.raisedBy}{iss.owner ? ` → ${iss.owner}` : ""}</span>
                </li>
              ))}
            </ol>}
      </Seg>

      <Seg n={7} title="Conclude" mins={5} href="#notes" hrefLabel="Notes & rating">
        <ul className="space-y-1 text-sm text-slate-600">
          <li>• Recap new <strong>to-dos</strong> created during IDS — each with an owner and a 7-day due date.</li>
          <li>• Decide the <strong>cascading message</strong> — what to communicate to the rest of the team.</li>
          <li>• Everyone <strong>rates the meeting 1–10</strong> (target 8+). Log the rating in the notes below.</li>
        </ul>
      </Seg>
    </div>
  );
}
