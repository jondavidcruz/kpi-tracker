import { db } from "./db";

// ⚠️ KPI FLAGS (Jon 2026-11-04) — replaces the daily "Systemic KPI miss" task spam. One living
// flag per rep+KPI that's SUSTAINED-missing, auto-diagnosed into the REAL cause (goal too high /
// not enough leads / tracking gap / genuine coaching), with a trend and a manager-accountability
// layer: did the manager act, how long has it sat, and does it escalate to the owner.
//
// A flag is NOT a task — it's computed live from the alert history + entries, so it de-dupes
// itself and clears automatically when the rep recovers. The manager logs ONE coaching action per
// flag (stored in Resource __kpi_flag_actions__); if a flag sits 3+ days with no action it escalates.

export const FLAG_ACTIONS_CAT = "__kpi_flag_actions__";
const AUTO_TRACKED = new Set(["buyers_vetted", "new_buyers", "buy_boxes_captured", "developers_contacted", "dev_conversations", "ds_talk_time", "acq_talk_time"]);
const ACTIVITY_KEYS = new Set(["outbound_calls", "connected_calls", "buyers_contacted", "dev_conversations", "leads_worked"]);

export type FlagDiagnosis = { kind: "goal_high" | "lead_volume" | "tracking_gap" | "coaching"; label: string; fix: string; recalibrate: boolean };
export type FlagAction = { by: string; at: string; note: string };
export interface KpiFlag {
  key: string;        // `${userId}|${kpiId}` — stable, de-duped
  userId: string;
  userName: string;
  kpiId: string;
  kpiKey: string;
  kpiName: string;
  emoji: string;
  missLast7: number;
  missPrior7: number;
  goal: number;
  median: number;     // 28-day median attainment
  diagnosis: FlagDiagnosis;
  trend: "improving" | "flat" | "worse";
  daysOpen: number;
  action: FlagAction | null;
  addressed: boolean; // a manager action was logged AFTER the flag's current flare began
  escalated: boolean; // 3+ days open, no action → surfaces to the owner
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const shift = (base: string, days: number) => { const d = new Date(base + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return ymd(d); };

export async function readFlagActions(): Promise<Record<string, FlagAction>> {
  const row = await db.resource.findFirst({ where: { category: FLAG_ACTIONS_CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : {}; } catch { return {}; }
}

/** Compute the live KPI flags across all active reps. */
export async function computeKpiFlags(): Promise<KpiFlag[]> {
  const { computeGoalProposals } = await import("./recalibrate");
  const today = ymd(new Date());
  const since7 = shift(today, -6);
  const since14 = shift(today, -13);

  // Median + current goal per rep+KPI (only at_least per-rep daily KPIs, active reps).
  const proposals = await computeGoalProposals(28);
  const byPair = new Map(proposals.map((p) => [`${p.userId}|${p.kpiId}`, p]));

  // Miss history (alerts) over the last 14 days.
  const alerts = await db.alert.findMany({ where: { date: { gte: since14 }, userId: { not: null } }, select: { userId: true, kpiId: true, date: true } }).catch(() => [] as { userId: string | null; kpiId: string; date: string }[]);
  const missDates = new Map<string, Set<string>>();     // pair key → set of miss dates
  const missByUser = new Map<string, Set<string>>();     // userId → kpiKeys missed in last 7 (for lead-volume cross-check)
  for (const a of alerts) {
    if (!a.userId) continue;
    const k = `${a.userId}|${a.kpiId}`;
    (missDates.get(k) ?? missDates.set(k, new Set()).get(k)!).add(a.date);
  }

  const actions = await readFlagActions();
  const flags: KpiFlag[] = [];
  for (const [key, dates] of missDates) {
    const [userId] = key.split("|");
    const last7 = [...dates].filter((d) => d >= since7).length;
    if (last7 < 4) continue; // only SUSTAINED misses flag
    const prior7 = [...dates].filter((d) => d >= since14 && d < since7).length;
    const p = byPair.get(key);
    if (!p) continue; // not a goal-bearing KPI we can reason about
    (missByUser.get(userId) ?? missByUser.set(userId, new Set()).get(userId)!).add(p.kpiKey);

    const firstSeen = [...dates].sort()[0];
    const daysOpen = Math.max(1, Math.round((Date.parse(today) - Date.parse(firstSeen)) / 86400000));
    const act = actions[key] ?? null;
    const addressed = !!act && Date.parse(act.at) >= Date.parse(firstSeen + "T00:00:00Z");
    const escalated = !addressed && daysOpen >= 3;
    const trend: KpiFlag["trend"] = last7 < prior7 ? "improving" : last7 > prior7 ? "worse" : "flat";

    flags.push({
      key, userId, userName: p.userName, kpiId: p.kpiId, kpiKey: p.kpiKey, kpiName: p.kpiName, emoji: p.emoji,
      missLast7: last7, missPrior7: prior7, goal: p.currentGoal, median: p.median,
      diagnosis: { kind: "coaching", label: "", fix: "", recalibrate: false }, // filled below
      trend, daysOpen, action: act, addressed, escalated,
    });
  }

  // Diagnose each flag (needs missByUser fully built for the lead-volume cross-check).
  for (const f of flags) {
    const alsoMissingActivity = [...(missByUser.get(f.userId) ?? [])].some((k) => ACTIVITY_KEYS.has(k) && k !== f.kpiKey);
    if (f.goal > 0 && f.median > 0 && f.median * 1.25 < f.goal) {
      f.diagnosis = { kind: "goal_high", label: `Goal likely too high — 28-day median is ${f.median} vs a ${f.goal} goal`, fix: "Recalibrate the goal to reality.", recalibrate: true };
    } else if (AUTO_TRACKED.has(f.kpiKey) && f.median === 0) {
      f.diagnosis = { kind: "tracking_gap", label: "Possible tracking gap — this KPI auto-feeds from the CRM but is reading 0", fix: "Confirm the rep works inside the War Room (dialer / kanban) so it's captured.", recalibrate: false };
    } else if (alsoMissingActivity) {
      f.diagnosis = { kind: "lead_volume", label: "Not enough at-bats — the rep is also short on upstream activity (dials / connects)", fix: "Check lead flow before coaching — it may be a marketing problem, not the rep.", recalibrate: false };
    } else {
      f.diagnosis = { kind: "coaching", label: "Genuine gap — volume's there and the goal is realistic", fix: "This one needs coaching / a conversation with the rep.", recalibrate: false };
    }
  }

  // Sort: escalated first, then worse trend, then most misses.
  const trendRank = { worse: 0, flat: 1, improving: 2 };
  flags.sort((a, b) => Number(b.escalated) - Number(a.escalated) || trendRank[a.trend] - trendRank[b.trend] || b.missLast7 - a.missLast7);
  return flags;
}
