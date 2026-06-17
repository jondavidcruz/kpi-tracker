// Alert engine. Phase 2: evaluates entries and records in-app alerts (deduped).
// Phase 3 extends sendAlert() to also deliver to Google Chat + email and adds
// scheduled pace/missing-entry checks.
import { db } from "./db";
import { getActiveReps, getSettings, resolveGoal } from "./data";
import { monthOf, paceFraction, todayStr } from "./date";
import { formatValue, type Unit } from "./format";
import { alertSeverity, statusVsGoal, statusVsPace } from "./kpi";
import { dailyGap, buildCoaching } from "./gap";
import { dealsNeedingAttention } from "./deals";
import { sendWeeklyTeamEmail, sendDailyTeamReview } from "./weekly";
import { sendEthanReminder } from "./ethan-reminder";
import { recordWeeklyAwards } from "./awards";
import { sendEosPulse } from "./eos-pulse";
import {
  alertEmailHtml,
  getChannelConfig,
  sendEmail,
  sendEmailTo,
  sendGoogleChat,
} from "./notify";
import type { Kpi } from "@prisma/client";

export interface NewAlert {
  kpiId: string;
  userId: string | null;
  date: string;
  severity: "hard" | "soft";
  expected: number;
  actual: number;
  message: string;
  // coaching context (so dispatch can build a gap assessment + training plan)
  kpiKey: string;
  kpiName: string;
  unit: string;
  cadence: string;
  goalKind: string;
  goal: number; // resolved goal value
  userName: string | null;
}

/**
 * Evaluate the given KPIs for `date`. Records new alerts for misses and
 * resolves open alerts that have recovered. Returns the alerts newly created
 * (so callers can dispatch them to external channels).
 */
export async function evaluateAndRecordAlerts(
  date: string,
  kpiIds?: string[],
): Promise<NewAlert[]> {
  const month = monthOf(date);
  const fraction = paceFraction(date);
  const reps = await getActiveReps();

  const kpis = await db.kpi.findMany({
    where: {
      active: true,
      computed: false,
      ...(kpiIds && kpiIds.length ? { id: { in: kpiIds } } : {}),
    },
  });

  const created: NewAlert[] = [];

  for (const kpi of kpis) {
    const severity = alertSeverity(kpi);
    if (!severity) continue; // yellow / red never alert

    const subjects: { userId: string | null; userName: string | null }[] =
      kpi.scope === "per_rep"
        ? reps
            .filter((r) => r.role !== "admin") // the owner manages the team; no KPI alerts on their own lane
            .filter((r) => (kpi.roleKey === "internet" ? r.tracksInternet : r.position === kpi.roleKey))
            .map((r) => ({ userId: r.id, userName: r.name }))
        : [{ userId: null, userName: null }];

    for (const subj of subjects) {
      const result = await evaluateOne(kpi, subj.userId, date, month, fraction);
      if (!result) continue; // no entry yet -> nothing to judge here

      const key = { kpiId: kpi.id, userId: subj.userId, date, severity };
      const existing = await db.alert.findFirst({ where: key });

      if (result.status === "miss") {
        const message = buildMessage(kpi, subj.userName, result);
        const enriched: NewAlert = {
          ...key,
          expected: result.expected,
          actual: result.actual,
          message,
          kpiKey: kpi.key,
          kpiName: kpi.name,
          unit: kpi.unit,
          cadence: kpi.cadence,
          goalKind: kpi.goalKind,
          goal: result.goal,
          userName: subj.userName,
        };
        if (!existing) {
          await db.alert.create({
            data: {
              ...key,
              expected: result.expected,
              actual: result.actual,
              message,
              status: "open",
            },
          });
          created.push(enriched);
        } else if (existing.status === "resolved") {
          // It had recovered and slipped again — reopen with fresh numbers.
          await db.alert.update({
            where: { id: existing.id },
            data: { status: "open", expected: result.expected, actual: result.actual, message },
          });
          created.push(enriched);
        } else {
          // Still open/ack — keep the numbers and message current.
          await db.alert.update({
            where: { id: existing.id },
            data: { expected: result.expected, actual: result.actual, message },
          });
        }
      } else {
        // Recovered to goal/pace — auto-resolve this rep's open alerts for this
        // KPI: today's AND any still-open from earlier days, tagged "recovered".
        await db.alert.updateMany({
          where: { kpiId: kpi.id, userId: subj.userId, date: { lte: date }, status: { in: ["open", "ack"] } },
          data: { status: "resolved", resolutionCategory: "recovered", resolvedBy: "auto", resolvedAt: new Date() },
        });
      }
    }
  }

  return created;
}

async function evaluateOne(
  kpi: Kpi,
  userId: string | null,
  date: string,
  month: string,
  fraction: number,
): Promise<{ status: ReturnType<typeof statusVsGoal>; expected: number; actual: number; goal: number } | null> {
  const goal = await resolveGoal(kpi, kpi.scope === "per_rep" ? userId : null, month);
  if (goal === null) return null;

  if (kpi.cadence === "daily") {
    const entry = await db.entry.findFirst({ where: { kpiId: kpi.id, userId, date } });
    if (!entry) return null; // missing-entry handled by scheduled check (Phase 3)
    return { status: statusVsGoal(kpi.goalKind, entry.value, goal), expected: goal, actual: entry.value, goal };
  }

  // monthly: month-to-date sum vs expected pace
  const { start } = monthBoundsLite(date);
  const entries = await db.entry.findMany({ where: { kpiId: kpi.id, date: { gte: start, lte: date } } });
  if (entries.length === 0) return null;
  const mtd = entries.reduce((s, e) => s + e.value, 0);
  return { status: statusVsPace(kpi.goalKind, mtd, goal, fraction), expected: goal * fraction, actual: mtd, goal };
}

function monthBoundsLite(date: string) {
  return { start: `${date.slice(0, 7)}-01` };
}

function buildMessage(
  kpi: Kpi,
  userName: string | null,
  r: { expected: number; actual: number },
): string {
  const who = userName ? `${userName}'s ` : "";
  const unit = kpi.unit as Unit;
  const cadenceWord = kpi.cadence === "monthly" ? " (month-to-date pace)" : "";
  return `${who}${kpi.name} is behind: ${formatValue(unit, r.actual)} vs ${formatValue(
    unit,
    r.expected,
  )} expected${cadenceWord}.`;
}

// --- Channel dispatch --------------------------------------------------------

/** Mark which channels delivered an alert. */
async function recordChannels(a: NewAlert, channels: string[]) {
  await db.alert.updateMany({
    where: { kpiId: a.kpiId, userId: a.userId, date: a.date, severity: a.severity },
    data: { channelsSent: JSON.stringify(channels) },
  });
}

/**
 * Deliver hard (green money) alerts immediately to Google Chat + email.
 * Soft alerts are saved in-app and batched into the daily digest instead.
 */
export async function dispatchHardAlerts(created: NewAlert[]): Promise<void> {
  const hard = created.filter((a) => a.severity === "hard");
  if (hard.length === 0) return;

  // Team works Mon–Fri only — never push external alerts on the weekend.
  const settings = await getSettings();
  if (isWeekend(settings.orgTimezone)) return;

  const cfg = await getChannelConfig();

  // Build a coaching block (gap + why + training plan) for each hard miss.
  const blocks = hard.map((a) => {
    const g = dailyGap(a.goalKind, a.actual, a.goal); // hard alerts are daily money KPIs
    const gap = g ?? { short: Math.max(0, a.goal - a.actual), goal: a.goal, value: a.actual };
    return {
      alert: a,
      coaching: buildCoaching({
        kpiKey: a.kpiKey, kpiName: a.kpiName, unit: a.unit as Unit, gap, who: a.userName,
      }),
    };
  });

  // Google Chat: title + per-KPI gap assessment + training plan.
  const noun = hard.length === 1 ? "money KPI is" : "money KPIs are";
  const chatText =
    `🔴 *KPI ALERT*: ${hard.length} ${noun} behind target right now:\n\n` +
    blocks
      .map((b) => {
        const who = b.alert.userName ? `*${b.alert.userName}* · ` : "";
        return (
          `${who}${b.alert.kpiName}\n` +
          `⚠️ ${b.coaching.headline}\n` +
          `🔍 Why: ${b.coaching.diagnose}\n` +
          `✅ Training plan:\n` +
          b.coaching.plan.map((p) => `   • ${p}`).join("\n")
        );
      })
      .join("\n\n");

  const chatOk = await sendGoogleChat(chatText, cfg);
  const emailOk = await sendEmail(
    `🔴 ${hard.length} money KPI alert${hard.length === 1 ? "" : "s"}: gap + training plan`,
    coachingEmailHtml(blocks),
    cfg,
  );

  const channels = ["in_app"];
  if (chatOk) channels.push("google_chat");
  if (emailOk) channels.push("email");
  for (const a of hard) await recordChannels(a, channels);
}

/** Rich HTML email with a gap assessment + training plan per KPI. */
function coachingEmailHtml(
  blocks: { alert: NewAlert; coaching: { headline: string; diagnose: string; plan: string[] } }[],
): string {
  const cards = blocks
    .map((b) => {
      const who = b.alert.userName ? `${b.alert.userName} · ` : "";
      const steps = b.coaching.plan.map((p) => `<li style="margin:3px 0;">${escapeHtmlLocal(p)}</li>`).join("");
      return `<div style="margin:0 0 14px;padding:14px 16px;background:#fff7f7;border:1px solid #fecaca;border-radius:10px;">
        <div style="font-weight:700;color:#0b1f3a;font-size:15px;">${escapeHtmlLocal(who + b.alert.kpiName)}</div>
        <div style="color:#b91c1c;font-weight:600;margin:4px 0;">⚠️ ${escapeHtmlLocal(b.coaching.headline)}</div>
        <div style="color:#475569;margin:4px 0;"><strong>Why:</strong> ${escapeHtmlLocal(b.coaching.diagnose)}</div>
        <div style="color:#0b1f3a;margin-top:6px;"><strong>Training plan:</strong></div>
        <ul style="margin:4px 0 0;padding-left:20px;color:#334155;">${steps}</ul>
      </div>`;
    })
    .join("");
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#0b1f3a;">🔴 KPI alert: action needed</h2>
    <p style="color:#64748b;">A money KPI is behind target. Here's the gap and how to close it:</p>
    ${cards}
    <p style="color:#94a3b8;font-size:13px;">Freedom Offers KPI Tracker · open the dashboard to acknowledge.</p>
  </div>`;
}

function escapeHtmlLocal(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Missing-entry detection (scheduled) -------------------------------------

/** Reps who haven't logged a goal-bearing per-rep daily KPI raise a soft flag. */
export async function generateMissingEntryAlerts(date: string): Promise<NewAlert[]> {
  // No one works weekends — never flag missing entries for a Sat/Sun date.
  const dow = new Date(date + "T12:00:00Z").getUTCDay(); // 0=Sun..6=Sat
  if (dow === 0 || dow === 6) return [];
  const reps = await getActiveReps();
  const kpis = await db.kpi.findMany({
    where: {
      active: true,
      computed: false,
      scope: "per_rep",
      cadence: "daily",
      goalKind: { not: "tracked" },
    },
  });

  const created: NewAlert[] = [];
  for (const kpi of kpis) {
    const severity = alertSeverity(kpi);
    if (!severity) continue;
    for (const rep of reps.filter((r) => (kpi.roleKey === "internet" ? r.tracksInternet : r.position === kpi.roleKey))) {
      if (rep.role === "admin") continue; // the owner manages the team; no missing-entry nags
      if (rep.irregularSchedule) continue; // no set schedule, don't nag on off days
      const entry = await db.entry.findFirst({ where: { kpiId: kpi.id, userId: rep.id, date } });
      if (entry) continue; // they logged something, nothing missing
      const existing = await db.alert.findFirst({
        where: { kpiId: kpi.id, userId: rep.id, date, severity },
      });
      if (existing) continue; // already flagged (missing or behind)
      const message = `${rep.name} hasn't logged ${kpi.name} today.`;
      await db.alert.create({
        data: { kpiId: kpi.id, userId: rep.id, date, severity, expected: kpi.goalValue ?? 0, actual: 0, message, status: "open" },
      });
      created.push({
        kpiId: kpi.id, userId: rep.id, date, severity, expected: kpi.goalValue ?? 0, actual: 0, message,
        kpiKey: kpi.key, kpiName: kpi.name, unit: kpi.unit, cadence: kpi.cadence,
        goalKind: kpi.goalKind, goal: kpi.goalValue ?? 0, userName: rep.name,
      });
    }
  }
  return created;
}

// --- Missing-KPI email to the manager (Marie) --------------------------------

/**
 * EOD email to the managers (Marie + Jon): who hasn't logged their KPIs today,
 * or whose data isn't recording. Lists each rep and the KPIs still blank so
 * Marie can chase before end of day. Weekdays only.
 */
export async function sendMissingKpiEmail(date: string): Promise<boolean> {
  const dow = new Date(date + "T12:00:00Z").getUTCDay();
  if (dow === 0 || dow === 6) return false; // no weekends

  const [reps, dailyKpis, entries] = await Promise.all([
    getActiveReps(),
    db.kpi.findMany({ where: { active: true, computed: false, scope: "per_rep", cadence: "daily", goalKind: { not: "tracked" } } }),
    db.entry.findMany({ where: { date, userId: { not: null } }, select: { kpiId: true, userId: true } }),
  ]);
  const have = new Set(entries.map((e) => `${e.kpiId}|${e.userId}`));

  const missingByRep: { name: string; detail: string }[] = [];
  for (const rep of reps) {
    if (rep.role === "admin") continue; // owner isn't nagged
    if (rep.irregularSchedule) continue; // no set schedule (e.g. part-time) — don't nag
    const roleKpis = dailyKpis.filter((k) => (k.roleKey === "internet" ? rep.tracksInternet : k.roleKey === rep.position));
    if (roleKpis.length === 0) continue;
    const missing = roleKpis.filter((k) => !have.has(`${k.id}|${rep.id}`));
    if (missing.length === roleKpis.length) {
      missingByRep.push({ name: rep.name, detail: "nothing recorded today" });
    } else if (missing.length > 0) {
      missingByRep.push({ name: rep.name, detail: `missing: ${missing.map((k) => k.name).join(", ")}` });
    }
  }
  if (missingByRep.length === 0) return false;

  const managers = await db.user.findMany({ where: { active: true, role: { in: ["manager", "admin"] } }, select: { email: true } });
  const to = managers.map((m) => m.email).filter(Boolean);
  if (to.length === 0) return false;

  const html = alertEmailHtml(`KPIs not logged — ${date}`, [
    `${missingByRep.length} ${missingByRep.length === 1 ? "person hasn't" : "people haven't"} fully logged their KPIs today:`,
    ...missingByRep.map((r) => `• ${r.name} — ${r.detail}`),
    "Follow up before end of day. If someone is sure they logged it, check the entry actually saved (it isn't recording).",
  ]);
  return sendEmailTo(to, `📋 EOD: ${missingByRep.length} not fully logged (${date})`, html);
}

// Fixed team shift-start hours (America/Los_Angeles local), matched by first
// name. Each rep gets the speed-test email at the hour their shift begins.
// Edit here if hours change. Ethan is intentionally absent (supervised in person).
//   dow: 0=Sun … 6=Sat. Returns the local start hour for that weekday, or null (off).
export const SHIFT_START_HOURS: { match: string; startHour: (dow: number) => number | null }[] = [
  { match: "michelle", startHour: (d) => (d >= 1 && d <= 5 ? 9 : null) },  // Mon–Fri 9am
  { match: "sharyn", startHour: (d) => (d >= 1 && d <= 5 ? 9 : null) },     // Mon–Fri 9am
  { match: "marie", startHour: (d) => (d >= 1 && d <= 4 ? 13 : d === 5 ? 9 : null) }, // Mon–Thu 1pm, Fri 9am
];

/** Start-of-shift nudge: email scheduled reps whose shift starts in this `slot`
 *  ("am" = before noon, "pm" = noon or later) today and who haven't run their
 *  speed test yet. Two once-daily crons (Hobby-plan friendly) cover am/pm. */
export async function sendShiftStartSpeedReminders(date: string, slot: "am" | "pm", laDow: number): Promise<number> {
  if (laDow === 0 || laDow === 6) return 0; // no weekends

  const kpi = await db.kpi.findFirst({ where: { roleKey: "internet" } });
  if (!kpi) return 0;

  const [reps, entries] = await Promise.all([
    getActiveReps(),
    db.entry.findMany({ where: { kpiId: kpi.id, date }, select: { userId: true } }),
  ]);
  const tested = new Set(entries.map((e) => e.userId));

  let sent = 0;
  for (const rep of reps) {
    if (!rep.tracksInternet) continue;
    const cfg = SHIFT_START_HOURS.find((s) => rep.name.toLowerCase().includes(s.match));
    const start = cfg?.startHour(laDow);
    if (start == null) continue; // not scheduled / off today
    if ((slot === "am") !== (start < 12)) continue; // not this slot's shift start
    if (tested.has(rep.id) || !rep.email) continue;
    const html = alertEmailHtml("📡 Run your internet speed test", [
      `Hi ${rep.name.split(" ")[0]} — quick start-of-shift task.`,
      "Open the War Room and run your internet speed test. It records to your KPIs automatically and takes about 10 seconds.",
      "Goal: 50+ Mbps for a smooth dialer, calls, and CRM. If you're below, restart your router and re-test before you start dialing.",
    ]);
    if (await sendEmailTo([rep.email], "📡 Run your internet speed test", html)) sent++;
  }
  return sent;
}

// --- Daily digest ------------------------------------------------------------

/** Send a single Chat + email digest of all open alerts for the date.
 *  Money (hard) flags include a gap + training plan; activity/missing are listed. */
export async function sendDailyDigest(date: string): Promise<boolean> {
  const open = await db.alert.findMany({
    where: { status: "open", date },
    orderBy: [{ severity: "asc" }],
    include: { kpi: true, user: true },
  });
  if (open.length === 0) return false;

  const cfg = await getChannelConfig();
  const hard = open.filter((a) => a.severity === "hard");
  const soft = open.filter((a) => a.severity === "soft");

  // Coaching blocks for the money misses (skip missing-entry rows: actual 0 & no real gap value yet).
  const hardBlocks = hard.map((a) => {
    const g = dailyGap(a.kpi.goalKind, a.actual, a.expected);
    const gap = g ?? { short: Math.max(0, a.expected - a.actual), goal: a.expected, value: a.actual };
    return {
      who: a.user?.name ?? null,
      name: a.kpi.name,
      coaching: buildCoaching({ kpiKey: a.kpi.key, kpiName: a.kpi.name, unit: a.kpi.unit as Unit, gap, who: a.user?.name ?? null }),
    };
  });

  // ---- Google Chat ----
  const moneySection = hardBlocks
    .map((b) => {
      const who = b.who ? `*${b.who}* · ` : "";
      return `🔴 ${who}${b.name}\n   ⚠️ ${b.coaching.headline}\n   🔍 ${b.coaching.diagnose}\n   ✅ ${b.coaching.plan.map((p) => p).join("  •  ")}`;
    })
    .join("\n\n");
  const softSection = soft.map((a) => `🔵 ${a.message}`).join("\n");
  const chatText =
    `📊 *KPI Digest* (${date}): ${hard.length} money + ${soft.length} activity\n\n` +
    (moneySection ? moneySection + "\n\n" : "") +
    (softSection ? `*Activity / missing:*\n${softSection}` : "");

  const chatOk = await sendGoogleChat(chatText, cfg);

  // ---- Email (rich coaching cards for money, plain list for the rest) ----
  const emailHtml =
    coachingEmailHtml(
      hardBlocks.map((b) => ({
        alert: { userName: b.who, kpiName: b.name } as NewAlert,
        coaching: b.coaching,
      })),
    ) +
    (soft.length
      ? alertEmailHtml(`Activity / missing: ${date}`, soft.map((a) => a.message))
      : "");
  const emailOk = await sendEmail(
    `📊 KPI Digest (${date}): ${open.length} open flag${open.length === 1 ? "" : "s"}`,
    emailHtml,
    cfg,
  );
  return chatOk || emailOk;
}

// --- Deal aging alerts -------------------------------------------------------

/** Post a digest of dispo deals sitting too long / nearing expiration. */
export async function sendDealAgingAlerts(today: string): Promise<boolean> {
  const deals = await db.deal.findMany({ where: { active: true } });
  const flagged = dealsNeedingAttention(deals, today);
  if (flagged.length === 0) return false;

  const cfg = await getChannelConfig();

  const chatLines = flagged.map((x) => {
    const icon = x.aging.level === "stale" ? "🔴" : x.aging.level === "reduce" ? "🟠" : "🟡";
    const who = x.deal.assignedTo ? ` (${x.deal.assignedTo})` : "";
    return `${icon} *${x.deal.address}*${who}\n   ${x.aging.recommendation}${x.deal.nextSteps ? `\n   _Next:_ ${x.deal.nextSteps}` : ""}`;
  });
  const chatText = `🏠 *Dispo Deal Watch*: ${flagged.length} deal${flagged.length === 1 ? "" : "s"} need attention:\n\n` + chatLines.join("\n\n");
  const chatOk = await sendGoogleChat(chatText, cfg);

  const cards = flagged
    .map((x) => {
      const tone = x.aging.level === "stale" ? "#b91c1c" : x.aging.level === "reduce" ? "#b45309" : "#0369a1";
      return `<div style="margin:0 0 12px;padding:12px 14px;background:#fafafa;border-left:4px solid ${tone};border-radius:8px;">
        <div style="font-weight:700;color:#0b1f3a;">${escapeHtmlLocal(x.deal.address)}${x.deal.assignedTo ? ` · ${escapeHtmlLocal(x.deal.assignedTo)}` : ""}</div>
        <div style="color:${tone};font-weight:600;margin:4px 0;">${escapeHtmlLocal(x.aging.recommendation)}</div>
        ${x.deal.nextSteps ? `<div style="color:#475569;"><strong>Next steps:</strong> ${escapeHtmlLocal(x.deal.nextSteps)}</div>` : ""}
      </div>`;
    })
    .join("");
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2 style="color:#0b1f3a;">🏠 Dispo Deal Watch</h2>
    <p style="color:#64748b;">Deals on market too long or nearing expiration. Act to keep them moving.</p>
    ${cards}
  </div>`;
  const emailOk = await sendEmail(`🏠 Dispo Deal Watch: ${flagged.length} need attention`, html, cfg);
  return chatOk || emailOk;
}

// --- Orchestrator (called by the cron route) ---------------------------------

/** Current weekday short-name in the org timezone, e.g. "Mon". */
function weekdayName(tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date());
}

/** True on Saturday/Sunday in the org timezone (team works Mon–Fri only). */
function isWeekend(tz: string): boolean {
  const day = weekdayName(tz);
  return day === "Sat" || day === "Sun";
}

/** True if today (org tz) is the given weekday short-name. */
function isWeekday(tz: string, name: string): boolean {
  return weekdayName(tz) === name;
}

function pastCutoff(cutoff: string, tz: string): boolean {
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date()); // "HH:MM"
  return now >= cutoff;
}

export interface ScheduledResult {
  date: string;
  newAlerts: number;
  missing: number;
  digestSent: boolean;
  dealAlertsSent: boolean;
  weeklySent: boolean;
  dailyReviewSent: boolean;
  missingKpiEmailSent: boolean;
  ethanReminded: boolean;
}

/**
 * Full scheduled pass: re-evaluate today, flag missing entries (after the
 * workday cutoff), dispatch any new hard alerts, then send the daily digest.
 */
export async function runScheduledChecks(opts?: {
  date?: string;
  force?: boolean;
  weekly?: boolean; // force-send the weekly team email regardless of weekday
  review?: boolean; // force-send the daily end-of-day team review
}): Promise<ScheduledResult> {
  const settings = await getSettings();
  const tz = settings.orgTimezone;
  const date = opts?.date ?? todayStr(tz);

  // Friday is a short day — the whole team releases at 2pm, so EOD (team review,
  // missing-KPI email, missing-entry flags) runs after 14:00 on Fridays instead
  // of the normal end-of-day cutoff. Mon–Thu use the standard cutoff.
  const cutoff = isWeekday(tz, "Fri") ? "14:00" : settings.workdayCutoff;

  // Re-evaluate today's entries and record alerts in-app.
  const created = await evaluateAndRecordAlerts(date);

  // Missing-entry flags only after the workday cutoff — so the morning (8:30am
  // pre-shift) digest doesn't nag about a day that just started, but the
  // evening (6:30pm post-shift) one catches anyone who didn't log by 6pm.
  // Weekends are off — skip missing-entry nags (and the digest below) unless forced.
  const weekdayOrForce = opts?.force || !isWeekend(tz);
  let missing: NewAlert[] = [];
  if (weekdayOrForce && (opts?.force || pastCutoff(cutoff, tz))) {
    missing = await generateMissingEntryAlerts(date);
  }

  // The twice-daily digest is the scheduled snapshot of everything still open
  // (hard + soft + missing), each with its gap + training plan. Instant hard
  // alerts already fired on save; the digest is the pre-/post-shift summary.
  // Skip on weekends (team works Mon–Fri) unless a manual force run is requested.
  const digestSent = weekdayOrForce ? await sendDailyDigest(date) : false;
  // Dispo deal-aging watch rides along with the same twice-daily, weekday schedule.
  const dealAlertsSent = weekdayOrForce ? await sendDealAgingAlerts(date) : false;

  // Weekly team KPI email — Monday morning only (or any forced run with ?weekly=1).
  const isMondayMorning = isWeekday(tz, "Mon") && !pastCutoff("12:00", tz);
  const weeklySent =
    opts?.weekly || isMondayMorning ? await sendWeeklyTeamEmail(date) : false;
  // Record last week's top-performer wins for the gamified leaderboard (Mondays).
  if (opts?.weekly || isMondayMorning) await recordWeeklyAwards(date).catch(() => {});
  // Weekly EOS pulse to managers — off-track Rocks, To-Dos, open-issue counts.
  if (opts?.weekly || isMondayMorning) await sendEosPulse(date).catch(() => {});

  // End-of-day team review — on the post-cutoff (6:30pm) weekday run, after KPIs
  // are entered. Force with ?review=1.
  const postCutoff = pastCutoff(cutoff, tz);
  const dailyReviewSent =
    opts?.review || (weekdayOrForce && postCutoff)
      ? await sendDailyTeamReview(date)
      : false;

  // EOD missing-KPI email to managers (Marie + Jon) — who hasn't logged today.
  const missingKpiEmailSent =
    opts?.review || (weekdayOrForce && postCutoff)
      ? await sendMissingKpiEmail(date)
      : false;

  // Ethan's shift-aware EOD reminder — only on days the AQ Shift calendar says
  // he worked, after his shift would have ended (post-cutoff), and not on a
  // forced run with no real time context unless explicitly forced.
  const ethanReminded =
    opts?.force || (weekdayOrForce && postCutoff)
      ? await sendEthanReminder(date)
      : false;

  return { date, newAlerts: created.length, missing: missing.length, digestSent, dealAlertsSent, weeklySent, dailyReviewSent, missingKpiEmailSent, ethanReminded };
}
