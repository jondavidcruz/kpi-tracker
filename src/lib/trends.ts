// Daily history for the dashboard sparklines: for each recent working day,
// how many per-rep goal KPIs were on goal vs behind, how many reps logged, and
// how many alerts were raised. Derived live from entries (no stored rollups).
import { db } from "./db";
import { getActiveReps, getKpis, getAllTargets, resolveGoalWith } from "./data";
import { datesInRange, monthOf } from "./date";
import { statusVsGoal } from "./kpi";

export interface DayPoint {
  date: string;
  onGoal: number;
  behind: number;
  logged: number;
  alertsRaised: number;
}

function shiftDays(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export async function getDailyTrends(endDate: string, days = 14): Promise<DayPoint[]> {
  const start = shiftDays(endDate, -(days * 2 + 4)); // enough calendar days to cover N working days
  const [reps, perRep, targets] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", cadence: "daily", computed: false }),
    getAllTargets(),
  ]);
  const internetKpis = perRep.filter((k) => k.roleKey === "internet");

  const working = datesInRange(start, endDate)
    .filter((d) => {
      const dow = new Date(d + "T00:00:00Z").getUTCDay();
      return dow >= 1 && dow <= 5;
    })
    .slice(-days);

  const [entries, alerts] = await Promise.all([
    db.entry.findMany({ where: { date: { gte: start, lte: endDate }, userId: { not: null } } }),
    db.alert.findMany({ where: { createdAt: { gte: new Date(start + "T00:00:00Z") } }, select: { createdAt: true } }),
  ]);

  const val = new Map<string, number>();
  for (const e of entries) if (e.userId) val.set(`${e.userId}|${e.kpiId}|${e.date}`, e.value);

  const alertByDay = new Map<string, number>();
  for (const a of alerts) {
    const d = a.createdAt.toISOString().slice(0, 10);
    alertByDay.set(d, (alertByDay.get(d) ?? 0) + 1);
  }

  return working.map((d) => {
    const month = monthOf(d);
    let onGoal = 0;
    let behind = 0;
    const loggedReps = new Set<string>();
    for (const rep of reps) {
      const kpis = rep.tracksInternet
        ? [...perRep.filter((k) => k.roleKey === rep.position), ...internetKpis]
        : perRep.filter((k) => k.roleKey === rep.position);
      for (const k of kpis) {
        const v = val.get(`${rep.id}|${k.id}|${d}`);
        if (v === undefined) continue;
        loggedReps.add(rep.id);
        const goal = resolveGoalWith(targets, k, rep.id, month);
        if (goal === null || k.goalKind === "tracked") continue;
        const s = statusVsGoal(k.goalKind, v, goal);
        if (s === "hit") onGoal += 1;
        else if (s === "miss") behind += 1;
      }
    }
    return { date: d, onGoal, behind, logged: loggedReps.size, alertsRaised: alertByDay.get(d) ?? 0 };
  });
}
