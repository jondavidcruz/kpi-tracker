// ⚠️ KPI Watch — the signal, not the noise (Jon 2026-11-03: "alerts/pips weren't
// identifying real KPI issues, and it was noise every day"). Instead of flagging every
// single-day miss, this surfaces only SUSTAINED problems: a rep-KPI on a miss streak, or
// one that's below goal most of the last ~2 weeks. Ranked worst-first so a manager scans
// a short list weekly, not a daily inbox. Pure read of the same Entry/goal data the
// scorecards use — no new tables, no extra writes.
import { db } from "./db";
import { tracksSpeedTest } from "./auth";
import { getActiveReps, getKpis, resolveGoalWith, getAllTargets } from "./data";
import { datesInRange } from "./date";
import { statusVsGoal } from "./kpi";
import { type Unit } from "./format";

function shiftDays(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const WATCH_WINDOW = 10; // consider the last N LOGGED working days
export const WATCH_STREAK = 3;  // ≥3 consecutive logged-day misses → on watch
export const WATCH_RATE = 0.6;  // OR missed ≥60% of the logged days in the window

export interface WatchItem {
  userId: string;
  userName: string;
  kpiKey: string;
  kpiName: string;
  emoji: string;
  unit: Unit;
  goal: number;
  streak: number;   // current consecutive miss streak (logged days only)
  missed: number;   // misses within the window
  logged: number;   // logged working days within the window
  lastValue: number | null;
  avgShort: number; // average shortfall vs goal across missed days
  severity: number; // ranking score (higher = worse)
  reason: string;   // "5-day miss streak" / "missed 7 of last 10"
  pip: boolean;     // already at the auto-PIP threshold (streak ≥ 4)
}

/** Rep-KPI combos that are SUSTAINED problems as of endDate, ranked worst-first. */
export async function findWatchItems(endDate: string): Promise<WatchItem[]> {
  const [reps, perRep, targets] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false, cadence: "daily" }),
    getAllTargets(),
  ]);
  const month = endDate.slice(0, 7);
  const start = shiftDays(endDate, -27); // ~4 calendar weeks → enough to find 10 logged working days
  const workingDays = datesInRange(start, endDate).filter((d) => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    return dow >= 1 && dow <= 5;
  });

  const entries = await db.entry.findMany({ where: { date: { gte: start, lte: endDate }, userId: { not: null } } });
  const val = new Map<string, number>(); // `${userId}|${kpiId}|${date}` -> value
  for (const e of entries) if (e.userId) val.set(`${e.userId}|${e.kpiId}|${e.date}`, e.value);

  // Manager-excused days (PTO, outage, holiday) don't count as misses.
  const excusedAlerts = await db.alert.findMany({ where: { excused: true, date: { gte: start, lte: endDate } }, select: { userId: true, kpiId: true, date: true } });
  const excused = new Set<string>();
  for (const e of excusedAlerts) if (e.userId) excused.add(`${e.userId}|${e.kpiId}|${e.date}`);

  const out: WatchItem[] = [];
  for (const rep of reps) {
    if (rep.role === "admin") continue; // never auto-watch the owner
    const repKpis = [
      ...perRep.filter((k) => k.roleKey === rep.position),
      ...(tracksSpeedTest(rep) ? perRep.filter((k) => k.roleKey === "internet") : []),
    ];
    for (const k of repKpis) {
      const goal = resolveGoalWith(targets, k, rep.id, month);
      if (goal === null || k.goalKind === "tracked") continue;

      // Walk backwards over LOGGED days only (a missing entry isn't a miss here), newest first.
      const logged: Array<{ date: string; miss: boolean; short: number; value: number }> = [];
      for (let i = workingDays.length - 1; i >= 0 && logged.length < WATCH_WINDOW; i--) {
        const d = workingDays[i];
        if (excused.has(`${rep.id}|${k.id}|${d}`)) continue;
        const v = val.get(`${rep.id}|${k.id}|${d}`);
        if (v === undefined) continue; // not logged
        const miss = statusVsGoal(k.goalKind, v, goal) === "miss";
        logged.push({ date: d, miss, short: Math.max(0, goal - v), value: v });
      }
      if (logged.length === 0) continue;

      let streak = 0;
      for (const l of logged) { if (l.miss) streak++; else break; } // leading misses = current streak
      const missed = logged.filter((l) => l.miss).length;
      const rate = missed / logged.length;
      const onWatch = streak >= WATCH_STREAK || (logged.length >= 4 && rate >= WATCH_RATE);
      if (!onWatch) continue;

      const missShorts = logged.filter((l) => l.miss).map((l) => l.short);
      const avgShort = missShorts.length ? missShorts.reduce((a, b) => a + b, 0) / missShorts.length : 0;
      const severity = streak * 100 + Math.round(rate * 50) + Math.min(50, Math.round(avgShort));
      const reason = streak >= WATCH_STREAK ? `${streak}-day miss streak` : `missed ${missed} of last ${logged.length}`;
      out.push({
        userId: rep.id, userName: rep.name, kpiKey: k.key, kpiName: k.name, emoji: k.emoji, unit: k.unit as Unit,
        goal, streak, missed, logged: logged.length, lastValue: logged[0]?.value ?? null, avgShort, severity, reason,
        pip: streak >= 4,
      });
    }
  }
  out.sort((a, b) => b.severity - a.severity);
  return out;
}
