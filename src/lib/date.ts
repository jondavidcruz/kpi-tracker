// Timezone-aware date helpers. Dates are stored as "YYYY-MM-DD" strings
// computed in the org timezone, so a "day" lines up with the team's day.

const DEFAULT_TZ = "America/New_York";

/** "YYYY-MM-DD" for `now` in the given timezone. */
export function todayStr(tz: string = DEFAULT_TZ, now: Date = new Date()): string {
  return ymd(now, tz);
}

function ymd(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA yields YYYY-MM-DD
}

/** The "YYYY-MM" month for a date string. */
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** First and last date strings of the month containing `dateStr`. */
export function monthBounds(dateStr: string): { start: string; end: string } {
  const [y, m] = dateStr.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** Number of calendar days in the month of `dateStr`. */
export function daysInMonth(dateStr: string): number {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 1-based day-of-month for `dateStr`. */
export function dayOfMonth(dateStr: string): number {
  return Number(dateStr.split("-")[2]);
}

/** Friendly label like "Saturday, May 31". */
export function friendlyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(dt);
}

/** Expected month-to-date pace fraction (0..1) = day / daysInMonth. */
export function paceFraction(dateStr: string): number {
  return dayOfMonth(dateStr) / daysInMonth(dateStr);
}
