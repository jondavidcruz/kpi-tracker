// Shift-aware end-of-day KPI reminder for Ethan. He works an irregular ~3h
// schedule that's published on the "AQ Shift" Google Calendar as
// "Ethan - AQ Shift" (working) / "Ethan - OFF work" (off). We read that
// calendar's secret iCal feed and only nudge him on days he actually worked.
import { db } from "./db";
import { getSettings } from "./data";
import { sendEmailTo, alertEmailHtml, getChannelConfig } from "./notify";
import { APP_URL } from "./site";

/** Parse an iCal timestamp to an absolute Date. Handles UTC (…Z) and naive forms. */
function parseIcsTs(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null; // all-day VALUE=DATE etc. — ignored (those are OFF days)
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

/**
 * The latest shift END (absolute Date) for Ethan on org-tz day `ymd`, or null
 * if he's off. Matches "Ethan … (not OFF)" events whose START falls on that day
 * in the org timezone, then takes the latest DTEND. Times in the feed are UTC,
 * so we compare absolute instants — no local/UTC string mixups.
 */
export function shiftEndToday(ics: string, ymd: string, tz: string): Date | null {
  let latest: Date | null = null;
  for (const block of ics.split("BEGIN:VEVENT").slice(1)) {
    const summary = (block.match(/SUMMARY:(.*)/)?.[1] ?? "").toLowerCase();
    if (!summary.includes("ethan") || summary.includes("off")) continue;
    const start = parseIcsTs(block.match(/DTSTART[^:]*:([0-9TZ]+)/)?.[1]);
    if (!start) continue;
    const startYmd = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(start);
    if (startYmd !== ymd) continue;
    const end = parseIcsTs(block.match(/DTEND[^:]*:([0-9TZ]+)/)?.[1]) ?? start;
    if (!latest || end > latest) latest = end;
  }
  return latest;
}

/**
 * Remind Ethan once his shift has ended, if he worked today and hasn't logged.
 * Safe to call from any cron run — it only fires after his shift-end time and
 * dedupes to one email per day. Returns true if a reminder was sent.
 */
export async function sendEthanReminder(date: string): Promise<boolean> {
  const settings = await getSettings();
  const icsUrl = (settings.ethanShiftIcsUrl ?? "").trim();
  const to = (settings.ethanReminderEmail ?? "").trim();
  if (!icsUrl || !to) return false; // not configured yet
  if (settings.ethanRemindedOn === date) return false; // already reminded today

  let ics: string;
  try {
    const res = await fetch(icsUrl, { cache: "no-store" });
    if (!res.ok) { console.error("[ethan] ICS fetch failed:", res.status); return false; }
    ics = await res.text();
  } catch (err) { console.error("[ethan] ICS fetch error:", err); return false; }

  const shiftEnd = shiftEndToday(ics, date, settings.orgTimezone);
  if (!shiftEnd) return false; // off today — no nudge
  if (Date.now() < shiftEnd.getTime()) return false; // shift not over yet

  const ethan = await db.user.findFirst({ where: { active: true, name: { contains: "Ethan" } } });
  if (ethan) {
    const logged = await db.entry.findFirst({ where: { userId: ethan.id, date } });
    if (logged) return false; // already logged something today
  }

  const html = alertEmailHtml("Don't forget your KPIs 📋", [
    "Hey Ethan — your shift today is wrapping up.",
    `Please log today's numbers before you sign off: <a href="${APP_URL}/entry">${APP_URL}/entry</a>`,
    "It takes about a minute. Thank you! 🙌",
  ]);
  const sent = await sendEmailTo([to], "📋 Quick reminder: log today's KPIs", html);
  if (sent) await db.settings.update({ where: { id: 1 }, data: { ethanRemindedOn: date } });
  return sent;
}
