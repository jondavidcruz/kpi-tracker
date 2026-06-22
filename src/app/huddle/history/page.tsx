import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { friendlyDate } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const HIT_CLS: Record<string, string> = { hit: "bg-emerald-100 text-emerald-700", partial: "bg-amber-100 text-amber-700", miss: "bg-red-100 text-red-700" };
const HIT_LABEL: Record<string, string> = { hit: "✅ Hit", partial: "🟡 Partial", miss: "❌ Missed" };

export default async function HuddleHistoryPage() {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;

  // Last ~6 weeks of activity.
  const since = new Date(Date.now() - 42 * 86400000).toISOString().slice(0, 10);
  const [standups, checks, users] = await Promise.all([
    db.standup.findMany({ where: { date: { gte: since } }, orderBy: { date: "desc" } }),
    db.huddleCheck.findMany({ where: { date: { gte: since } }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  // date -> userId -> { eodHit, eodNote, goals[], pendings[] }
  type Row = { eodHit: string; eodNote: string; goals: { text: string; done: boolean }[]; pendings: { text: string; done: boolean }[] };
  const byDate = new Map<string, Map<string, Row>>();
  const ensure = (date: string, userId: string): Row => {
    let day = byDate.get(date); if (!day) { day = new Map(); byDate.set(date, day); }
    let row = day.get(userId); if (!row) { row = { eodHit: "", eodNote: "", goals: [], pendings: [] }; day.set(userId, row); }
    return row;
  };
  for (const s of standups) { const r = ensure(s.date, s.userId); r.eodHit = s.eodHit; r.eodNote = s.eodNote; }
  for (const c of checks) { const r = ensure(c.date, c.userId); (c.kind === "pending" ? r.pendings : r.goals).push({ text: c.text, done: c.done }); }

  const dates = [...byDate.keys()].sort().reverse();

  // Quick accountability roll-up: per-rep totals over the window.
  const tally = new Map<string, { goalsDone: number; goalsTotal: number; hits: number; days: number }>();
  for (const [, day] of byDate) for (const [uid, r] of day) {
    const t = tally.get(uid) ?? { goalsDone: 0, goalsTotal: 0, hits: 0, days: 0 };
    t.goalsTotal += r.goals.length; t.goalsDone += r.goals.filter((g) => g.done).length;
    if (r.eodHit) { t.days += 1; if (r.eodHit === "hit") t.hits += 1; }
    tally.set(uid, t);
  }

  return (
    <div className="space-y-5">
      <SectionTitle title="📜 Huddle History" subtitle="Every day's goals, what got done, and end-of-day results — so the team stays accountable."
        accent="bg-brand-gold" right={<Link href="/huddle" className="text-sm font-semibold text-brand-navy hover:underline">← Today&apos;s huddle</Link>} />

      {/* Accountability roll-up */}
      {tally.size > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-slate-700">Last 6 weeks — at a glance</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...tally.entries()].map(([uid, t]) => (
              <div key={uid} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-semibold text-slate-700">{nameById.get(uid)?.split(" ")[0] ?? "—"}</span>
                <span className="text-xs text-slate-500">
                  Goals <b className="tabular-nums text-slate-700">{t.goalsDone}/{t.goalsTotal}</b> · Hit days <b className="tabular-nums text-slate-700">{t.hits}/{t.days}</b>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {dates.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">No huddle activity in the last 6 weeks yet.</Card>
      ) : (
        dates.map((date) => {
          const day = byDate.get(date)!;
          const rows = [...day.entries()].filter(([, r]) => r.goals.length || r.pendings.length || r.eodHit || r.eodNote);
          if (rows.length === 0) return null;
          return (
            <Card key={date} className="p-4">
              <div className="mb-2 text-sm font-bold text-slate-700">{friendlyDate(date)}</div>
              <div className="space-y-2">
                {rows.map(([uid, r]) => {
                  const done = r.goals.filter((g) => g.done).length;
                  return (
                    <div key={uid} className="rounded-lg border border-slate-100 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">{nameById.get(uid) ?? "—"}</span>
                        {r.eodHit && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${HIT_CLS[r.eodHit] ?? "bg-slate-100"}`}>{HIT_LABEL[r.eodHit] ?? r.eodHit}</span>}
                        {r.goals.length > 0 && <span className="text-xs text-slate-400">goals {done}/{r.goals.length} done</span>}
                      </div>
                      {r.goals.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {r.goals.map((g, i) => (
                            <li key={i} className={`text-xs ${g.done ? "text-slate-400 line-through" : "text-slate-600"}`}>{g.done ? "✅" : "⬜"} {g.text}</li>
                          ))}
                        </ul>
                      )}
                      {r.eodNote && <div className="mt-1 text-xs text-slate-500">🌙 {r.eodNote}</div>}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
