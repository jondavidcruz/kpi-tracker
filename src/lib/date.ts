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

// The Mon–Sun week CONTAINING dateStr (the current week). Sums only include days
// that actually have entries, so this shows the week's progress so far.
export function currentWeekRange(dateStr: string): { start: string; end: string; label: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const toMonday = dow === 0 ? 6 : dow - 1;
  const mon = new Date(dt);
  mon.setUTCDate(dt.getUTCDate() - toMonday);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  const labelFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  return { start: fmt(mon), end: fmt(sun), label: `${labelFmt.format(mon)} – ${labelFmt.format(sun)}` };
}

/** Last week's Mon–Sun range (the completed week before the one containing `dateStr`). */
export function lastWeekRange(dateStr: string): { start: string; end: string; label: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  // Days back to this week's Monday:
  const toMonday = dow === 0 ? 6 : dow - 1;
  const thisMon = new Date(dt);
  thisMon.setUTCDate(dt.getUTCDate() - toMonday);
  const lastMon = new Date(thisMon);
  lastMon.setUTCDate(thisMon.getUTCDate() - 7);
  const lastSun = new Date(lastMon);
  lastSun.setUTCDate(lastMon.getUTCDate() + 6);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  const start = fmt(lastMon);
  const end = fmt(lastSun);
  const labelFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  return { start, end, label: `${labelFmt.format(lastMon)} – ${labelFmt.format(lastSun)}` };
}

/** All date strings in an inclusive range. */
export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const cur = new Date(Date.UTC(ys, ms - 1, ds));
  const last = new Date(Date.UTC(ye, me - 1, de));
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Semi-monthly pay period containing `dateStr`, shifted by `offset` half-months.
 *  A = 1st–15th, B = 16th–end. Pays on the 15th and 1st. */
export function payPeriod(dateStr: string, offset = 0): { key: string; label: string; start: string; end: string } {
  const y0 = Number(dateStr.slice(0, 4));
  const m0 = Number(dateStr.slice(5, 7));
  const day = Number(dateStr.slice(8, 10));
  const half0 = day <= 15 ? 0 : 1;
  const idx = y0 * 24 + (m0 - 1) * 2 + half0 + offset;
  const y = Math.floor(idx / 24);
  const rem = ((idx % 24) + 24) % 24;
  const m = Math.floor(rem / 2) + 1;
  const half = rem % 2;
  const mp = String(m).padStart(2, "0");
  const mn = MONTHS_SHORT[m - 1];
  if (half === 0) {
    return { key: `${y}-${mp}-A`, label: `${mn} 1–15, ${y}`, start: `${y}-${mp}-01`, end: `${y}-${mp}-15` };
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { key: `${y}-${mp}-B`, label: `${mn} 16–${lastDay}, ${y}`, start: `${y}-${mp}-16`, end: `${y}-${mp}-${String(lastDay).padStart(2, "0")}` };
}

const DAY_MS = 86400000;
function utcMs(d: string): number { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); }
function isoFromMs(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
function shortDate(d: string): string { const [, m, dd] = d.split("-").map(Number); return `${MONTHS_SHORT[m - 1]} ${dd}`; }

/** Whole-day difference today − anchor (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcMs(b) - utcMs(a)) / DAY_MS);
}

/** Biweekly pay cycle (14 days) ending on a payday, anchored to `anchor` (a real
 *  payday). Cycle containing `today`, shifted by `offset` cycles. */
export function biweeklyPeriod(today: string, anchor: string, offset = 0): { key: string; label: string; start: string; end: string } {
  const diff = daysBetween(anchor, today);
  const k = Math.ceil(diff / 14); // cycles from anchor to the payday on/after today
  const endMs = utcMs(anchor) + (k + offset) * 14 * DAY_MS;
  const startMs = endMs - 13 * DAY_MS;
  const start = isoFromMs(startMs), end = isoFromMs(endMs);
  return { key: end, label: `${shortDate(start)} – ${shortDate(end)}`, start, end };
}

/** True if `today` is a payday given the biweekly anchor (every 14 days). */
export function isPayday(today: string, anchor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return false;
  return daysBetween(anchor, today) % 14 === 0;
}

/** True if `today` is a semi-monthly payday — the 15th or the last day of the month. */
export function isSemiMonthlyPayday(today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  const [y, m, d] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === 15 || d === lastDay;
}
