// Consecutive on-goal working-day streaks per rep, for the wall display.
// A rep's streak = how many of the most-recent logged working days in a row they
// hit goal on their PRIMARY money KPI (first green goal-bearing KPI for their
// role). Not-yet-logged recent days are skipped; a miss or a gap ends the streak.
import { db } from "./db";
import { getActiveReps, getKpis, getAllTargets, resolveGoalWith } from "./data";
import { datesInRange, monthOf } from "./date";
import { statusVsGoal } from "./kpi";

export interface Streak {
  userId: string;
  name: string;
  days: number;
  kpiName: string;
  kpiEmoji: string;
}

export async function computeStreaks(date: string): Promise<Streak[]> {
  const [reps, perRep, targets] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", cadence: "daily", computed: false }),
    getAllTargets(),
  ]);
  const month = monthOf(date);

  // Window: last ~5 weeks of working days up to `date`, most-recent first.
  const start = shift(date, -35);
  const workingDesc = datesInRange(start, date)
    .filter((d) => {
      const dow = new Date(d + "T00:00:00Z").getUTCDay();
      return dow >= 1 && dow <= 5;
    })
    .reverse();

  const entries = await db.entry.findMany({
    where: { date: { gte: start, lte: date }, userId: { not: null } },
  });
  const val = new Map<string, number>(); // `${userId}|${kpiId}|${date}`
  for (const e of entries) if (e.userId) val.set(`${e.userId}|${e.kpiId}|${e.date}`, e.value);

  const out: Streak[] = [];
  for (const rep of reps) {
    const primary = perRep.find(
      (k) => k.roleKey === rep.position && k.category === "green" && k.goalKind !== "tracked",
    );
    if (!primary) continue;
    const goal = resolveGoalWith(targets, primary, rep.id, month);
    if (goal === null) continue;

    let started = false;
    let streak = 0;
    for (const d of workingDesc) {
      const v = val.get(`${rep.id}|${primary.id}|${d}`);
      if (v === undefined) {
        if (!started) continue; // not logged yet (e.g. today) — skip leading gaps
        break; // a gap after the streak started ends it
      }
      started = true;
      if (statusVsGoal(primary.goalKind, v, goal) === "hit") streak += 1;
      else break;
    }
    if (streak >= 2) {
      out.push({ userId: rep.id, name: rep.name, days: streak, kpiName: primary.name, kpiEmoji: primary.emoji });
    }
  }
  return out.sort((a, b) => b.days - a.days);
}

function shift(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
