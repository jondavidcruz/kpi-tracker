import { NextResponse } from "next/server";
import { runScheduledChecks, sendShiftStartSpeedReminders } from "@/lib/alerts";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { db } from "@/lib/db";
import { buildBackup } from "@/lib/backup";
import { sendEmailWithAttachment, sendTeamChat, sendEmailTo, sendTimecardChat, postChatWebhook } from "@/lib/notify";
import { upcomingCulture, prettyMMDD, whenLabel, ordinal } from "@/lib/culture";
import { isSemiMonthlyPayday } from "@/lib/date";
import { sendPayrollEmail } from "@/lib/payday";
import { sendCallCoverageChat } from "@/lib/call-coverage";
import { autoCloseAbandonedSessions } from "@/lib/timeclock";
import { sendHuddleBrief, sendHuddleNudge } from "@/lib/huddle-brief";
import { writeDay, writeOpps, writeActivity } from "@/lib/crm-sync";
import { migrateRecordingsToDrive } from "@/lib/recording-migrate";
import { sendLeaksReport } from "@/lib/diagnostics";
import { sendBuyerBoxReport } from "@/lib/buyer-report";

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
export const maxDuration = 60;

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

  // Weekly vetted-buyer lead-sourcing report → Jon (Friday end-of-shift). Analyzes only the
  // vetted buyers' buy boxes and tells him where to pull leads + which NEW markets to consider.
  if (url.searchParams.get("buyerreport") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const res = await sendBuyerBoxReport(today);
    return NextResponse.json({ ok: true, job: "buyerreport", ...res });
  }

  // Advance any armed buyer cascades whose wait window has elapsed (next 3 buyers).
  if (url.searchParams.get("cascade") === "1") {
    const { advanceCascades } = await import("@/lib/cascade");
    const res = await advanceCascades();
    return NextResponse.json({ ok: true, job: "cascade", ...res });
  }

  // Daily phone-health digest → posts unhealthy numbers to the phone-health Chat space.
  if (url.searchParams.get("phonehealth") === "1") {
    const [cfg, rows] = await Promise.all([
      db.resource.findFirst({ where: { category: "__phone_config__" } }),
      db.resource.findMany({ where: { category: "__phone_line__" }, orderBy: { sortOrder: "asc" } }),
    ]);
    const webhook = cfg?.url ?? "";
    if (!webhook || rows.length === 0) return NextResponse.json({ ok: true, job: "phonehealth", sent: false, reason: !webhook ? "no webhook" : "no numbers" });
    const bad: string[] = [];
    for (const r of rows) {
      let m: { provider?: string; label?: string; registered?: boolean; att?: string; verizon?: string; tmobile?: string; answerRate?: number | null } = {};
      try { m = JSON.parse(r.description || "{}"); } catch {}
      const flagged = [m.att, m.verizon, m.tmobile].includes("flagged");
      const lowRate = m.answerRate != null && m.answerRate < 5;
      const notReg = !m.registered;
      if (flagged || lowRate || notReg) {
        const why = [flagged && "🚩 flagged", lowRate && `📉 ${m.answerRate}%`, notReg && "unregistered"].filter(Boolean).join(" · ");
        bad.push(`• ${r.title}${m.label ? ` (${m.label})` : ""} — ${why}`);
      }
    }
    if (bad.length === 0) return NextResponse.json({ ok: true, job: "phonehealth", sent: false, reason: "all healthy" });
    const ok = await postChatWebhook(webhook, `📞 *Phone Health — daily check*\n${bad.length} of ${rows.length} number(s) need attention:\n${bad.join("\n")}\n\nTest + dispute flagged ones; register the rest at freecallerregistry.com.`);
    return NextResponse.json({ ok: true, job: "phonehealth", sent: ok, flagged: bad.length });
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

  // Month-end P&L reminder — on the 1st, nudge Viktoriia + Enrico to prepare the expenses
  // for the month that just finished.
  if (url.searchParams.get("monthend") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const d = new Date(today + "T12:00:00Z"); d.setUTCDate(0); // last day of the previous month
    const prevMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthName = new Date(prevMonth + "-01T12:00:00Z").toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const users = await db.user.findMany({ where: { active: true }, select: { name: true, email: true } });
    const emails = users.filter((u) => ["viktoriia", "enrico"].includes(u.name.trim().split(/\s+/)[0].toLowerCase())).map((u) => u.email).filter(Boolean);
    const msg = `📊 Month-end reminder: please prepare the *${monthName}* expenses in the Profit & Loss Report — the month just closed and the books are due.`;
    await sendTeamChat(msg).catch(() => {});
    if (emails.length) await sendEmailTo(emails, `Prepare ${monthName} expenses — P&L`, `<p>📊 ${monthName} just closed.</p><p>Please open the <b>Profit &amp; Loss Report</b> in the War Room and enter ${monthName}'s expenses.</p>`).catch(() => {});

    // Auto cost-cut analysis → drop the top ideas into the AI Updates feed.
    let cuts = 0;
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      try {
        const lineRows = await db.expenseLine.findMany({ where: { month: prevMonth }, select: { category: true, label: true, actual: true } });
        if (lineRows.length) {
          const pnl = JSON.stringify({ month: monthName, lines: lineRows.map((l) => ({ label: l.label, category: l.category, actual: Math.round(l.actual) })) });
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
              model: "claude-opus-4-8", max_tokens: 900,
              system: "You are a frugal fractional CFO for a small, currently-unprofitable real-estate wholesaling business. From the month's P&L line items, identify the 2-3 highest-impact cost cuts (cancel, downgrade, consolidate, or renegotiate). Reply with ONLY a JSON array, no prose: [{\"title\":\"short action\",\"rationale\":\"why + est. $/mo saved\"}].",
              messages: [{ role: "user", content: `P&L for ${monthName}:\n${pnl}` }],
            }),
          });
          const j = await r.json();
          const txt = String(j?.content?.[0]?.text ?? "");
          const arr = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1)) as { title: string; rationale: string }[];
          for (let i = 0; i < Math.min(3, arr.length); i++) {
            const s = arr[i];
            if (!s?.title) continue;
            await db.suggestion.upsert({
              where: { id: `cut-${prevMonth}-${i}` },
              update: {},
              create: { id: `cut-${prevMonth}-${i}`, title: `💸 ${s.title}`, rationale: `${s.rationale} (from the ${monthName} P&L)`, category: "Cost-cut", impact: "high", effort: "S", status: "proposed" },
            });
            cuts++;
          }
        }
      } catch { /* AI advisory is best-effort */ }
    }
    return NextResponse.json({ ok: true, month: prevMonth, emailed: emails, cuts });
  }

  // Culture reminders — birthdays + work anniversaries. Posts to the team Google Chat
  // when there's a celebration TODAY, and (on Mondays) a preview of the week ahead.
  if (url.searchParams.get("culture") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    // Dates come from the Team Roster (TeamProfile): birthday + startDate.
    const [activeUsers, profiles] = await Promise.all([
      db.user.findMany({ where: { active: true }, select: { id: true } }),
      db.teamProfile.findMany({ select: { userId: true, name: true, birthday: true, startDate: true } }),
    ]);
    const activeIds = new Set(activeUsers.map((u) => u.id));
    const people = profiles
      .filter((p) => !p.userId || activeIds.has(p.userId))
      .map((p) => ({ name: p.name, birthday: /^\d{4}-\d{2}-\d{2}$/.test(p.birthday) ? p.birthday.slice(5) : null, hireDate: /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) ? p.startDate : null }));
    const up = upcomingCulture(people, today, 7);
    const todays = up.filter((u) => u.daysUntil === 0);
    const isMonday = laNow().dow === 1;
    let text = "";
    if (todays.length) {
      const lines = todays.map((u) => u.kind === "birthday" ? `🎂 Happy Birthday, *${u.name}*!` : `🎉 *${u.name}* — ${ordinal(u.years ?? 0)} work anniversary today!`);
      text = `*🎉 Culture — today*\n${lines.join("\n")}`;
    } else if (isMonday && up.length) {
      const wk = up.map((u) => `• ${prettyMMDD(u.mmdd)} — ${u.name} ${u.kind === "birthday" ? "🎂 birthday" : `🎖️ ${ordinal(u.years ?? 0)} anniversary`} (${whenLabel(u.daysUntil)})`).join("\n");
      text = `*📅 Culture this week*\n${wk}`;
    }
    if (!text) return NextResponse.json({ ok: true, posted: false });
    const sent = await sendTeamChat(text);
    return NextResponse.json({ ok: true, posted: sent, todays: todays.length });
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

  // End-of-day: post the "money calls vs recordings uploaded" check to the team so
  // anyone short on recordings uploads before logging off. Runs after the EOD CRM sync.
  if (url.searchParams.get("callcheck") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const res = await sendCallCoverageChat(today, settings.orgTimezone);
    return NextResponse.json({ ok: true, callcheck: res });
  }

  // Nightly: move call recordings off Supabase Storage into Google Drive (free).
  if (url.searchParams.get("recordings") === "1") {
    const res = await migrateRecordingsToDrive();
    return NextResponse.json({ ok: true, recordings: res });
  }

  // Live CRM sync — pulls TODAY's calls + offer/contract stage moves every ~15 min
  // so the scorecard is current throughout the day, not just at night.
  if (url.searchParams.get("crmtoday") === "1") {
    const settings = await getSettings();
    const tz = settings.orgTimezone;
    const today = date ?? todayStr(tz);
    const calls = await writeDay(today, tz);
    const opps = await writeOpps(today, tz);
    const activity = await writeActivity(today, calls.wrote, opps);
    return NextResponse.json({ ok: true, date: today, calls: calls.wrote, offersContracts: opps.counts, activity });
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
    const activity = await writeActivity(yesterday, calls.wrote, opps);
    return NextResponse.json({ ok: true, date: yesterday, calls: calls.wrote, offersContracts: opps.counts, activity });
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

  // Gentle break-time reminders (org-local, weekdays): 10:30 break, 12:00 lunch, 3:00 break.
  // Each is its own once-a-day cron in vercel.json. Posts to the Timecard Chat space.
  if (url.searchParams.get("breaknudge")) {
    const slot = url.searchParams.get("breaknudge");
    const msg =
      slot === "lunch"
        ? "🍔 *Lunch — 12:00.* Whole team's on lunch now. Step away, eat, recharge — then log it on your time card."
        : slot === "pm"
          ? "☕ *Afternoon break — ~3:00.* Everyone grab a quick 15 minutes to reset before the final push. (Log it on your time card.)"
          : "☕ *Break time — 10:30.* Michelle, Sharyn & Jon — take a quick 10–15 min to reset. You've earned it.";
    const chat = await sendTimecardChat(msg);
    return NextResponse.json({ ok: true, breaknudge: slot, chat });
  }

  // Midday run: the pm-shift crew's speed-test nudge (Marie). (Legacy ?ethan=1 param.)
  if (url.searchParams.get("ethan") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const speedTestReminded = await sendShiftStartSpeedReminders(today, "pm", laNow().dow);
    return NextResponse.json({ ok: true, speedTestReminded });
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
