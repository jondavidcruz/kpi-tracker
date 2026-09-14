// Timestamped log of EVERY internet speed test a rep runs in a day. The Entry
// row keeps the day's headline number (latest test), while this log preserves
// each check with its completion time (Jon 2026-09-14: post-lunch re-check +
// "show every single time they checked it, not just the one that overrides").
// Stored in the Resource table under a reserved category (no migration):
// one row per rep per date, title "<userId>|<date>", JSON array in description.
export const SPEED_CHECKS_CATEGORY = "__speed_checks__";

export type SpeedCheck = { t: string; mbps: number }; // t = ISO UTC timestamp

export function speedChecksTitle(userId: string, date: string): string {
  return `${userId}|${date}`;
}

export function parseSpeedChecks(raw: string | null | undefined): SpeedCheck[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((c) => c && typeof c.t === "string" && Number.isFinite(c?.mbps))
      : [];
  } catch {
    return [];
  }
}

/** "8:02 AM" — the check's completion time in the org timezone. */
export function fmtCheckTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  } catch {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

/** Minutes past local midnight in the org timezone. */
function localMinutes(iso: string, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(new Date(iso));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return h * 60 + m;
  } catch {
    return 0;
  }
}

// Lunch is 12–1 org time; a test at/after 12:30 counts as the back-from-lunch
// check (covers early returners without letting a mid-morning run count).
export const AFTERNOON_CHECK_MINUTES = 12 * 60 + 30;

/** Did any of the day's checks land at/after 12:30 PM org-local? */
export function hasAfternoonCheck(checks: SpeedCheck[], tz: string): boolean {
  return checks.some((c) => localMinutes(c.t, tz) >= AFTERNOON_CHECK_MINUTES);
}

/** Post-lunch re-checks apply Mon–Thu only — Friday has no lunch break (team
 *  releases at 2pm), weekends are off. dow: 0=Sun … 6=Sat. */
export function afternoonCheckRequired(dow: number): boolean {
  return dow >= 1 && dow <= 4;
}
