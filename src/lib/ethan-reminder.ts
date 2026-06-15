// Shift-aware end-of-day KPI reminder for Ethan. He works an irregular ~3h
// schedule that's published on the "AQ Shift" Google Calendar as
// "Ethan - AQ Shift" (working) / "Ethan - OFF work" (off). We read that
// calendar's secret iCal feed and only nudge him on days he actually worked.
import { db } from "./db";
import { getSettings } from "./data";
import { sendEmailTo, alertEmailHtml, getChannelConfig } from "./notify";

const APP_URL = "https://kpi-tracker-lovat.vercel.app";

/** True if the iCal feed has an "Ethan … (not OFF)" event starting on `ymd`. */
export function worksToday(ics: string, ymd: string): boolean {
  const target = ymd.replace(/-/g, ""); // "YYYY-MM-DD" -> "YYYYMMDD"
  for (const block of ics.split("BEGIN:VEVENT").slice(1)) {
    const summary = (block.match(/SUMMARY:(.*)/)?.[1] ?? "").toLowerCase();
    if (!summary.includes("ethan") || summary.includes("off")) continue;
    const start = block.match(/DTSTART[^:]*:(\d{8})/)?.[1];
    if (start === target) return true;
  }
  return false;
}

/**
 * If Ethan worked today (per the shift calendar) and hasn't logged any KPIs,
 * email him a reminder. Returns true if a reminder was sent.
 */
export async function sendEthanReminder(date: string): Promise<boolean> {
  const settings = await getSettings();
  const icsUrl = (settings.ethanShiftIcsUrl ?? "").trim();
  const to = (settings.ethanReminderEmail ?? "").trim();
  if (!icsUrl || !to) return false; // not configured yet

  let ics: string;
  try {
    const res = await fetch(icsUrl, { cache: "no-store" });
    if (!res.ok) { console.error("[ethan] ICS fetch failed:", res.status); return false; }
    ics = await res.text();
  } catch (err) { console.error("[ethan] ICS fetch error:", err); return false; }

  if (!worksToday(ics, date)) return false; // off today — no nudge

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
  return sendEmailTo([to], "📋 Quick reminder: log today's KPIs", html);
}
