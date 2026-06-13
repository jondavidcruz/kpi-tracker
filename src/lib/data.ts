// Data access for the dashboard and entry screens.
import { db } from "./db";
import { monthBounds, monthOf } from "./date";
import type { Kpi, Target, User } from "@prisma/client";

export async function getSettings() {
  return (
    (await db.settings.findUnique({ where: { id: 1 } })) ?? {
      id: 1,
      googleChatWebhook: "",
      alertEmailRecipients: "",
      emailFromAddress: "",
      workdayCutoff: "18:00",
      weekStart: "monday",
      orgTimezone: "America/New_York",
      annualRevenueGoal: 0,
      weeklyEmailRecipients: "",
    }
  );
}

/** Everyone who appears on a scorecard = active + has a position assigned.
 *  Role (permission: rep/manager/admin) is independent of position (which
 *  scorecard), so a manager/admin like Marie or Jon can still log their own KPIs. */
// Display order for reps across all KPI views (by first name). Anyone not listed
// falls to the end, alphabetically. Edit this list to reorder the team.
const REP_ORDER = ["Michelle", "Jon", "Ethan", "Sharyn", "Marie"];
function repRank(name: string): number {
  const first = name.split(" ")[0].toLowerCase();
  const i = REP_ORDER.findIndex((n) => n.toLowerCase() === first);
  return i === -1 ? 999 : i;
}

export async function getActiveReps(): Promise<User[]> {
  const reps = await db.user.findMany({ where: { active: true, position: { not: "" } } });
  return reps.sort((a, b) => repRank(a.name) - repRank(b.name) || a.name.localeCompare(b.name));
}

export async function getAllUsers(): Promise<User[]> {
  return db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
}

export async function getKpis(filter?: {
  scope?: string;
  cadence?: string;
  computed?: boolean;
  roleKey?: string;
}): Promise<Kpi[]> {
  return db.kpi.findMany({
    where: {
      active: true,
      ...(filter?.scope ? { scope: filter.scope } : {}),
      ...(filter?.cadence ? { cadence: filter.cadence } : {}),
      ...(filter?.computed !== undefined ? { computed: filter.computed } : {}),
      ...(filter?.roleKey !== undefined ? { roleKey: filter.roleKey } : {}),
    },
    orderBy: { sortOrder: "asc" },
  });
}

/** Resolve the goal for a KPI, honoring per-user / per-period Target overrides. */
export async function resolveGoal(
  kpi: Kpi,
  userId: string | null,
  period: string | null,
): Promise<number | null> {
  const overrides = await db.target.findMany({ where: { kpiId: kpi.id } });
  return resolveGoalWith(overrides, kpi, userId, period);
}

/** All target overrides (prefetch once, then resolve in-memory per cell). */
export async function getAllTargets(): Promise<Target[]> {
  return db.target.findMany();
}

/**
 * Pure goal resolver. Most specific wins:
 * user+period > user(standing) > team+period > team(standing) > KPI default.
 */
export function resolveGoalWith(
  targets: Target[],
  kpi: Pick<Kpi, "id" | "goalValue">,
  userId: string | null,
  period: string | null,
): number | null {
  const c = targets.filter((t) => t.kpiId === kpi.id);
  const pick =
    c.find((t) => t.userId === userId && t.period === period) ??
    c.find((t) => t.userId === userId && t.period === null) ??
    c.find((t) => t.userId === null && t.period === period) ??
    c.find((t) => t.userId === null && t.period === null);
  return pick ? pick.goalValue : kpi.goalValue;
}

/** Map of "kpiId|userId" -> value for a given date (daily entries). */
export async function getDailyValues(date: string): Promise<Map<string, number>> {
  const entries = await db.entry.findMany({ where: { date } });
  const map = new Map<string, number>();
  for (const e of entries) map.set(`${e.kpiId}|${e.userId ?? ""}`, e.value);
  return map;
}

/** Month-to-date sum per KPI up to and including `date`. */
export async function getMonthToDateSums(date: string): Promise<Map<string, number>> {
  const { start } = monthBounds(date);
  const entries = await db.entry.findMany({
    where: { date: { gte: start, lte: date } },
  });
  const sums = new Map<string, number>();
  for (const e of entries) sums.set(e.kpiId, (sums.get(e.kpiId) ?? 0) + e.value);
  return sums;
}

/** Monthly KPIs are stored as a single entry per month, dated to month start. */
export async function getMonthlyValues(date: string): Promise<Map<string, number>> {
  const { start } = monthBounds(date);
  const entries = await db.entry.findMany({ where: { date: start, userId: null } });
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.kpiId, e.value);
  return map;
}

export function monthKey(date: string): string {
  return monthOf(date);
}

// --- Deals (Dispositions board) ---------------------------------------------

/** Active deals for the board / report, newest activity first. */
export async function getActiveDeals() {
  return db.deal.findMany({
    where: { active: true },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

/** Deals still being pushed to sell (everything except closed/dead) — for report pg 6. */
export async function getOpenDeals() {
  return db.deal.findMany({
    where: { active: true, status: { notIn: ["closed", "dead"] } },
    orderBy: { updatedAt: "desc" },
  });
}

/** Revenue/escrow rollups for the report's page-4 money metrics. */
export async function getDealMetrics(yearPrefix: string) {
  const deals = await db.deal.findMany({ where: { active: true } });
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const closed = deals.filter((d) => d.status === "closed");
  const inEscrow = deals.filter((d) => d.status === "in_escrow");
  const closedThisYear = closed.filter((d) => d.soldDate.startsWith(yearPrefix));
  return {
    closedCount: closedThisYear.length,
    inEscrowCount: inEscrow.length,
    revenueClosed: sum(closedThisYear.map((d) => d.assignmentFee ?? 0)),
    revenuePendingEscrow: sum(inEscrow.map((d) => d.assignmentFee ?? 0)),
    activeCount: deals.filter((d) => !["closed", "dead"].includes(d.status)).length,
  };
}

/** Sum of entries per "kpiId|userId" across an inclusive date range (for weekly report). */
export async function getRangeSums(start: string, end: string): Promise<Map<string, number>> {
  const entries = await db.entry.findMany({ where: { date: { gte: start, lte: end } } });
  const sums = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.kpiId}|${e.userId ?? ""}`;
    sums.set(key, (sums.get(key) ?? 0) + e.value);
  }
  return sums;
}
