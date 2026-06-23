import { NextResponse } from "next/server";
import { runScheduledChecks, sendShiftStartSpeedReminders } from "@/lib/alerts";
import { sendEthanReminder } from "@/lib/ethan-reminder";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { db } from "@/lib/db";
import { buildBackup } from "@/lib/backup";
import { sendEmailWithAttachment } from "@/lib/notify";
import { isSemiMonthlyPayday } from "@/lib/date";
import { sendPayrollEmail } from "@/lib/payday";
import { autoCloseAbandonedSessions } from "@/lib/timeclock";
import { sendHuddleBrief, sendHuddleNudge } from "@/lib/huddle-brief";
import { writeDay, writeOpps } from "@/lib/crm-sync";
import { migrateRecordingsToDrive } from "@/lib/recording-migrate";
import { sendLeaksReport } from "@/lib/diagnostics";

// Current America/Los_Angeles hour (0–23) + weekday (0=Sun…6=Sat), DST-safe.
function laNow(): { hour: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 1;
  return { hour, dow };
}

export const dynamic = "force-dynamic";

/**
 * Scheduled alert check. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`. For manual runs you can pass
 * `?secret=$CRON_SECRET` and optionally `?date=YYYY-MM-DD&force=1`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const auth = request.headers.get("authorization");
    const fromHeader = auth === `Bearer ${secret}`;
    const fromQuery = url.searchParams.get("secret") === secret;
    if (!fromHeader && !fromQuery) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const date = url.searchParams.get("date") ?? undefined;
  const force = url.searchParams.get("force") === "1";
  const weekly = url.searchParams.get("weekly") === "1";
  const review = url.searchParams.get("review") === "1";

  // Nightly off-site backup — full DB export emailed to the owner(s) as a JSON
  // attachment. (Supabase's own PITR/daily backups are the primary; this is a
  // belt-and-suspenders copy that lands in Jon's inbox.)
  if (url.searchParams.get("backup") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const backup = await buildBackup();
    const admins = await db.user.findMany({ where: { active: true, role: "admin" }, select: { email: true } });
    const to = admins.map((a) => a.email).filter(Boolean);
    const content = Buffer.from(JSON.stringify(backup), "utf8").toString("base64");
    const emailed = to.length
      ? await sendEmailWithAttachment(
          to,
          `🗄️ War Room backup — ${today} (${backup.totalRows} rows)`,
          `<p>Nightly Freedom Offers War Room backup attached — <strong>${backup.totalRows} rows</strong> across ${Object.keys(backup.counts).length} tables. Keep this email; it's a full off-site copy.</p>`,
          { filename: `war-room-backup-${today}.json`, content },
        )
      : false;
    return NextResponse.json({ ok: true, backedUp: backup.totalRows, emailed });
  }

  // Payday — checked daily; only sends on actual semi-monthly paydays (the 15th
  // and the last day of the month). `&force=1` sends regardless for a test.
  if (url.searchParams.get("payroll") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    if (!force && !isSemiMonthlyPayday(today)) {
      return NextResponse.json({ ok: true, payday: false });
    }
    const sent = await sendPayrollEmail(today);
    return NextResponse.json({ ok: true, payday: true, sent });
  }

  // Manual speed-test reminder trigger (no dedicated cron — piggybacks on the
  // runs below). Test: ?speedtest=1&slot=pm&ladow=3 to simulate a slot/day.
  if (url.searchParams.get("speedtest") === "1") {
    const settings = await getSettings();
    const slot = url.searchParams.get("slot") === "pm" ? "pm" : "am";
    const dow = url.searchParams.has("ladow") ? Number(url.searchParams.get("ladow")) : laNow().dow;
    const reminded = await sendShiftStartSpeedReminders(date ?? todayStr(settings.orgTimezone), slot, dow);
    return NextResponse.json({ ok: true, slot, laDow: dow, speedTestReminded: reminded });
  }

  // Weekly Leaks report — Friday end of day (Sat 01:00 UTC ≈ Fri 6pm PT) → C-suite email.
  if (url.searchParams.get("leaks") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const sent = await sendLeaksReport(today);
    return NextResponse.json({ ok: true, leaks: sent });
  }

  // Nightly: move call recordings off Supabase Storage into Google Drive (free).
  if (url.searchParams.get("recordings") === "1") {
    const res = await migrateRecordingsToDrive();
    return NextResponse.json({ ok: true, recordings: res });
  }

  // Nightly REI Reply CRM sync — pulls YESTERDAY's calls + offer/contract stage
  // moves and writes them to the scorecard (talk time, conversations, dials,
  // offers made, contracts sent). 1am PT.
  if (url.searchParams.get("crm") === "1") {
    const settings = await getSettings();
    const tz = settings.orgTimezone;
    const today = date ?? todayStr(tz);
    const y = new Date(today + "T12:00:00Z"); y.setUTCDate(y.getUTCDate() - 1);
    const yesterday = url.searchParams.get("date") ?? y.toISOString().slice(0, 10);
    const calls = await writeDay(yesterday, tz);
    const opps = await writeOpps(yesterday, tz);
    return NextResponse.json({ ok: true, date: yesterday, calls: calls.wrote, offersContracts: opps.counts });
  }

  // Daily huddle brief — 9:45am PT, Mon–Fri (after the 9am huddle, so the team has
  // updated their goals first) → Google Chat + leadership email.
  if (url.searchParams.get("huddle") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const sent = await sendHuddleBrief(today);
    return NextResponse.json({ ok: true, huddle: sent });
  }

  // Huddle nudge — 9:30am PT (am) + 4:30pm PT (pm), Mon–Fri. Pings whoever hasn't
  // set today's goals / has open items, so the manager doesn't have to chase.
  if (url.searchParams.get("huddlenudge")) {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const slot = url.searchParams.get("huddlenudge") === "pm" ? "pm" : "am";
    const res = await sendHuddleNudge(today, slot);
    return NextResponse.json({ ok: true, huddlenudge: res });
  }

  // Midday run (1:30pm PT): Ethan's shift-end reminder + Marie's 1pm speed-test nudge.
  if (url.searchParams.get("ethan") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const ethanReminded = await sendEthanReminder(today);
    const speedTestReminded = await sendShiftStartSpeedReminders(today, "pm", laNow().dow);
    return NextResponse.json({ ok: true, ethanReminded, speedTestReminded });
  }

  // Full scheduled pass. On the MORNING run (before noon PT) also send the am
  // crew (Michelle/Sharyn, + Marie on Fri) their start-of-shift speed reminder.
  const la = laNow();
  let speedTestReminded = 0;
  if (la.hour < 12) {
    const settings = await getSettings();
    speedTestReminded = await sendShiftStartSpeedReminders(date ?? todayStr(settings.orgTimezone), "am", la.dow);
  }
  // Close any time card left open past its scheduled shift (forgot to clock out).
  const autoClockedOut = await autoCloseAbandonedSessions();
  const result = await runScheduledChecks({ date, force, weekly, review });
  return NextResponse.json({ ok: true, speedTestReminded, autoClockedOut, ...result });
}
