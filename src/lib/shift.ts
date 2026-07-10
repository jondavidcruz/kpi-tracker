// Scheduled-shift reference for the time clock.
//
// Until the Google Calendar sync is wired (pending the service-account creds),
// the team's FIXED shifts are encoded here. This is the schedule the time clock
// verifies worked time against, so a forgotten clock-out can never keep tracking
// through nights, weekends, or a vacation — worked minutes are always capped at
// the scheduled shift end (+ a short grace window for legitimate wrap-up).
//
// Team shift (org-local): Mon–Thu 8:00 AM–5:00 PM, Fri 8:00 AM–2:00 PM (no lunch), Sat/Sun off.
// Both start and end matter — the START is the pay floor (early clock-in is unpaid)
// and the END bounds the tracking (a forgotten clock-out can't run past shift).
// When the calendar feed lands, swap these for a per-person calendar lookup.
//
// Per-person exception: Marie works a 6-hour shift — 12:00–6:00 PM Mon–Thu, and
// 8:00 AM–1:00 PM on Fridays (the whole team is on the short 8–1 Friday). Pass her
// name as `who`.

const DEFAULT_TZ = "America/New_York";

/** How far (minutes) `tz` is offset from UTC at the given instant (DST-safe). */
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
  return (asUTC - date.getTime()) / 60000;
}

/** The instant for a wall-clock time (hour:min) on `dateStr` (YYYY-MM-DD) in `tz`. */
export function zonedTime(dateStr: string, hour: number, min: number, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hour, min, 0));
  const off = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - off * 60000);
}

/** Weekday (0=Sun … 6=Sat) of an org-local date string. */
function dowOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** First name (lowercased) used to look up per-person shift exceptions. */
function firstName(who?: string | null): string {
  return (who ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/**
 * Scheduled shift end (hour/min) for a date, or null on days with no shift.
 * Pass `who` (the person's name) to apply per-person exceptions — Marie ends at
 * 6:00 PM Mon–Thu. Everyone (incl. Marie) ends at 2:00 PM on the short Friday (no lunch).
 */
export function shiftEndHour(dateStr: string, who?: string | null): { hour: number; min: number } | null {
  const dow = dowOf(dateStr);
  if (dow < 1 || dow > 5) return null; //                  Sat/Sun → off
  if (dow === 5) return { hour: 14, min: 0 }; //            Fri     → 2:00 PM (whole team, no lunch)
  if (firstName(who) === "marie") return { hour: 18, min: 0 }; // Marie Mon–Thu → 6:00 PM
  return { hour: 17, min: 0 }; //                           Mon–Thu → 5:00 PM
}

/** The scheduled shift-end instant for `dateStr`, or null on weekends. */
export function shiftEndAt(dateStr: string, tz: string = DEFAULT_TZ, who?: string | null): Date | null {
  const e = shiftEndHour(dateStr, who);
  return e ? zonedTime(dateStr, e.hour, e.min, tz) : null;
}

/**
 * Scheduled shift START (hour/min) for a date, or null on no-shift days. Used as
 * a pay floor: clocking in early (before shift start) is not paid. Team default
 * is 8:00 AM Mon–Fri; Marie starts at 12:00 PM Mon–Thu (8:00 AM on Fridays).
 */
export function shiftStartHour(dateStr: string, who?: string | null): { hour: number; min: number } | null {
  const dow = dowOf(dateStr);
  if (dow < 1 || dow > 5) return null; // Sat/Sun → off
  if (dow === 5) return { hour: 8, min: 0 }; // Fri → 8:00 AM (whole team)
  if (firstName(who) === "marie") return { hour: 12, min: 0 }; // Marie Mon–Thu → 12:00 PM
  return { hour: 8, min: 0 }; //                                 8:00 AM default
}

/** The scheduled shift-start instant for `dateStr` (pay floor), or null on weekends. */
export function shiftStartAt(dateStr: string, tz: string = DEFAULT_TZ, who?: string | null): Date | null {
  const s = shiftStartHour(dateStr, who);
  return s ? zonedTime(dateStr, s.hour, s.min, tz) : null;
}

/** Grace minutes past shift end counted as real work before the hard cap. */
export const SHIFT_GRACE_MIN = 30;

/**
 * The latest instant the time clock will count toward worked time for `dateStr`.
 * = scheduled shift end + grace. An open session is never counted past this, so
 * a forgotten clock-out maxes out at the shift (not days of phantom hours).
 * Null on weekends → caller falls back to a flat max session length.
 */
export function workCapAt(dateStr: string, tz: string = DEFAULT_TZ, who?: string | null): Date | null {
  const end = shiftEndAt(dateStr, tz, who);
  return end ? new Date(end.getTime() + SHIFT_GRACE_MIN * 60000) : null;
}

/** Hard ceiling for an open session on a no-shift day (weekend/holiday). */
export const MAX_OPEN_SESSION_MIN = 10 * 60;

/** "6:00 PM" style label for the scheduled shift end, or null if no shift. */
export function shiftEndLabel(dateStr: string, who?: string | null): string | null {
  const e = shiftEndHour(dateStr, who);
  if (!e) return null;
  const ap = e.hour >= 12 ? "PM" : "AM";
  const h = e.hour % 12 || 12;
  return `${h}:${String(e.min).padStart(2, "0")} ${ap}`;
}
