// Goal recalibration — propose realistic per-rep daily goals from each rep's
// ACTUAL recent attainment, so "met" is achievable instead of a permanent miss.
// Owner reviews the proposals and applies them; nothing changes automatically.
import { db } from "./db";
import { getActiveReps, getKpis, getAllTargets, resolveGoalWith } from "./data";
import { navAllowlist } from "./auth";

export interface GoalProposal {
  userId: string;
  userName: string;
  kpiId: string;
  kpiKey: string;
  kpiName: string;
  emoji: string;
  unit: string;
  roleKey: string;
  currentGoal: number;
  daysLogged: number; // number of logged days in the window
  median: number;     // realistic anchor (hit ~half the days)
  best: number;       // 75th-percentile "good day" reference
  proposed: number;   // suggested new goal (rounded median, floor 1)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Propose realistic per-rep daily goals from the trailing `windowDays` of entries.
 * Only "at_least" per-rep daily KPIs are recalibrated (skips tracked/at_most and the
 * internet-speed standard, which is an infra requirement, not a performance goal).
 */
export async function computeGoalProposals(windowDays = 28): Promise<GoalProposal[]> {
  const [reps, kpis, targets] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", cadence: "daily", computed: false }),
    getAllTargets(),
  ]);
  const goalKpis = kpis.filter((k) => k.goalKind === "at_least" && k.roleKey !== "internet");

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - windowDays);
  const startStr = start.toISOString().slice(0, 10);

  const kpiIds = goalKpis.map((k) => k.id);
  const entries = kpiIds.length
    ? await db.entry.findMany({
        where: { kpiId: { in: kpiIds }, date: { gte: startStr }, userId: { not: null } },
        select: { kpiId: true, userId: true, value: true },
      })
    : [];

  const byPair = new Map<string, number[]>();
  for (const e of entries) {
    const key = `${e.kpiId}|${e.userId}`;
    const arr = byPair.get(key);
    if (arr) arr.push(e.value);
    else byPair.set(key, [e.value]);
  }

  const proposals: GoalProposal[] = [];
  for (const kpi of goalKpis) {
    const subjects = reps
      .filter((r) => r.role !== "admin")
      .filter((r) => !navAllowlist(r))
      .filter((r) => (kpi.roleKey === "internet" ? r.tracksInternet : r.position === kpi.roleKey));
    for (const r of subjects) {
      const vals = (byPair.get(`${kpi.id}|${r.id}`) ?? []).slice().sort((a, b) => a - b);
      if (vals.length === 0) continue; // no data to base a proposal on — leave the goal untouched
      const currentGoal = resolveGoalWith(targets, kpi, r.id, null) ?? kpi.goalValue ?? 0;
      const median = percentile(vals, 0.5);
      const best = percentile(vals, 0.75);
      proposals.push({
        userId: r.id,
        userName: r.name,
        kpiId: kpi.id,
        kpiKey: kpi.key,
        kpiName: kpi.name,
        emoji: kpi.emoji,
        unit: kpi.unit,
        roleKey: kpi.roleKey ?? "",
        currentGoal,
        daysLogged: vals.length,
        median: Math.round(median * 10) / 10,
        best: Math.round(best * 10) / 10,
        proposed: Math.max(1, Math.round(median)),
      });
    }
  }
  // Group by rep (in the reps' existing sort order), then by KPI sortOrder-ish (name).
  return proposals;
}
