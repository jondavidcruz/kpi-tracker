// Gap analysis: how far behind a KPI is, and what it takes to close the gap.
import { daysInMonth, dayOfMonth } from "./date";
import { formatValue, type Unit } from "./format";

export interface DailyGap {
  short: number; // how many units below goal (always > 0)
  goal: number;
  value: number;
}

/** Daily shortfall vs goal. Returns null if on/above goal or untracked. */
export function dailyGap(
  goalKind: string,
  value: number,
  goal: number | null,
): DailyGap | null {
  if (goal === null || goalKind === "tracked") return null;
  if (goalKind === "at_most") {
    const over = value - goal;
    return over > 0 ? { short: over, goal, value } : null;
  }
  const short = goal - value;
  return short > 0 ? { short, goal, value } : null;
}

export interface MonthlyGap {
  expected: number; // expected month-to-date by pace
  mtd: number;
  behindPace: number; // expected - mtd (> 0)
  remaining: number; // goal - mtd
  daysLeft: number; // calendar days left in month
  perDay: number; // remaining / daysLeft
}

/** Month-to-date pace gap + what's needed per day to still hit the goal. */
export function monthlyGap(
  date: string,
  goalKind: string,
  mtd: number,
  goal: number | null,
): MonthlyGap | null {
  if (goal === null || goalKind === "tracked" || goalKind === "at_most") return null;
  const dim = daysInMonth(date);
  const dom = dayOfMonth(date);
  const expected = goal * (dom / dim);
  const behindPace = expected - mtd;
  if (behindPace <= 0) return null; // on or ahead of pace
  const remaining = Math.max(0, goal - mtd);
  const daysLeft = Math.max(1, dim - dom);
  return { expected, mtd, behindPace, remaining, daysLeft, perDay: remaining / daysLeft };
}

/** Human "how to close it" line for a daily gap. */
export function dailyCatchup(unit: Unit, g: DailyGap): string {
  return `${formatValue(unit, g.short)} short of the ${formatValue(unit, g.goal)} goal.`;
}

/** Human "how to close it" line for a monthly gap. */
export function monthlyCatchup(unit: Unit, g: MonthlyGap): string {
  return `Behind pace by ${formatValue(unit, g.behindPace)} — need ${formatValue(
    unit,
    g.remaining,
  )} more in ${g.daysLeft} day${g.daysLeft === 1 ? "" : "s"} (~${formatValue(
    unit,
    Math.ceil(g.perDay),
  )}/day).`;
}
