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
import {
  alertEmailHtml,
  getChannelConfig,
  sendEmail,
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

  // Re-evaluate today's entries and record alerts in-app.
  const created = await evaluateAndRecordAlerts(date);

  // Missing-entry flags only after the workday cutoff — so the morning (8:30am
  // pre-shift) digest doesn't nag about a day that just started, but the
  // evening (6:30pm post-shift) one catches anyone who didn't log by 6pm.
  // Weekends are off — skip missing-entry nags (and the digest below) unless forced.
  const weekdayOrForce = opts?.force || !isWeekend(tz);
  let missing: NewAlert[] = [];
  if (weekdayOrForce && (opts?.force || pastCutoff(settings.workdayCutoff, tz))) {
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

  // End-of-day team review — on the post-cutoff (6:30pm) weekday run, after KPIs
  // are entered. Force with ?review=1.
  const postCutoff = pastCutoff(settings.workdayCutoff, tz);
  const dailyReviewSent =
    opts?.review || (weekdayOrForce && postCutoff)
      ? await sendDailyTeamReview(date)
      : false;

  return { date, newAlerts: created.length, missing: missing.length, digestSent, dealAlertsSent, weeklySent, dailyReviewSent };
}
