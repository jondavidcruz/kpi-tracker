// Performance Improvement Plan logic: detect chronic KPI misses and define the
// progressive accountability ladder. Consequences are intentionally framed to be
// defensible (commission/bonus, catch-up time) rather than base-pay docking.
import { db } from "./db";
import { getActiveReps, getKpis, resolveGoalWith, getAllTargets } from "./data";
import { datesInRange } from "./date";
import { statusVsGoal } from "./kpi";
import { buildCoaching, dailyGap } from "./gap";
import { type Unit } from "./format";

export const PIP_CONSECUTIVE_MISSES = 3; // working days in a row below goal -> flag

// The progressive ladder. Each stage names the support + the consequence if unmet.
export const PIP_STAGES = [
  {
    key: "coaching",
    label: "Stage 1 — Coaching",
    blurb: "Documented conversation + clear 5-day targets. Support offered first.",
    consequence: "None yet — support + a clear target. Miss the target → formal PIP.",
  },
  {
    key: "pip",
    label: "Stage 2 — Formal PIP",
    blurb: "Written plan, daily targets, scheduled check-ins, signed acknowledgment.",
    consequence: "Saturday catch-up hours to make up missed output.",
  },
  {
    key: "final",
    label: "Stage 3 — Final Warning",
    blurb: "Last review window. Hit targets to exit, or proceed to release.",
    consequence: "Commission/bonus hold + final written warning. Next miss → release.",
  },
  {
    key: "closed",
    label: "Closed",
    blurb: "Resolved (back on target) or separation completed.",
    consequence: "—",
  },
];

export function nextStage(stage: string): string {
  const i = PIP_STAGES.findIndex((s) => s.key === stage);
  return i >= 0 && i < PIP_STAGES.length - 1 ? PIP_STAGES[i + 1].key : "closed";
}

export function stageMeta(key: string) {
  return PIP_STAGES.find((s) => s.key === key) ?? PIP_STAGES[0];
}

export interface PipCandidate {
  userId: string;
  userName: string;
  kpiKey: string;
  kpiName: string;
  unit: Unit;
  goal: number;
  missedDates: string[]; // the consecutive miss streak
  coaching: { headline: string; diagnose: string; plan: string[] };
}

/**
 * Find reps with PIP_CONSECUTIVE_MISSES consecutive WORKING-DAY misses (below goal)
 * on a goal-bearing KPI, ending on `endDate`. Only counts days they actually logged
 * (a missing entry isn't a "miss" here — that's handled by missing-entry alerts).
 */
export async function findPipCandidates(endDate: string): Promise<PipCandidate[]> {
  const [reps, perRep, targets] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false, cadence: "daily" }),
    getAllTargets(),
  ]);
  const month = endDate.slice(0, 7);

  // Last ~3 weeks of working days up to endDate.
  const start = shiftDays(endDate, -20);
  const allDays = datesInRange(start, endDate).filter((d) => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    return dow >= 1 && dow <= 5;
  });
  const recent = allDays.slice(-PIP_CONSECUTIVE_MISSES); // the streak window

  const entries = await db.entry.findMany({
    where: { date: { gte: start, lte: endDate }, userId: { not: null } },
  });
  const val = new Map<string, number>(); // `${userId}|${kpiId}|${date}` -> value
  for (const e of entries) if (e.userId) val.set(`${e.userId}|${e.kpiId}|${e.date}`, e.value);

  const out: PipCandidate[] = [];
  for (const rep of reps) {
    const repKpis = [
      ...perRep.filter((k) => k.roleKey === rep.position),
      ...(rep.tracksInternet ? perRep.filter((k) => k.roleKey === "internet") : []),
    ];
    for (const k of repKpis) {
      const goal = resolveGoalWith(targets, k, rep.id, month);
      if (goal === null || k.goalKind === "tracked") continue;

      // Every day in the streak window must be logged AND a miss.
      let allMiss = true;
      const missed: string[] = [];
      for (const d of recent) {
        const v = val.get(`${rep.id}|${k.id}|${d}`);
        if (v === undefined) { allMiss = false; break; } // not logged → don't PIP on it
        if (statusVsGoal(k.goalKind, v, goal) === "miss") missed.push(d);
        else { allMiss = false; break; }
      }
      if (allMiss && missed.length >= PIP_CONSECUTIVE_MISSES) {
        // Skip if an open PIP already exists for this rep+KPI.
        const existing = await db.pip.findFirst({
          where: { userId: rep.id, kpiKey: k.key, status: "open" },
        });
        if (existing) continue;
        const lastVal = val.get(`${rep.id}|${k.id}|${recent[recent.length - 1]}`) ?? 0;
        const g = dailyGap(k.goalKind, lastVal, goal) ?? { short: goal - lastVal, goal, value: lastVal };
        out.push({
          userId: rep.id,
          userName: rep.name,
          kpiKey: k.key,
          kpiName: k.name,
          unit: k.unit as Unit,
          goal,
          missedDates: missed,
          coaching: buildCoaching({ kpiKey: k.key, kpiName: k.name, unit: k.unit as Unit, gap: g, who: rep.name }),
        });
      }
    }
  }
  return out;
}

function shiftDays(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
