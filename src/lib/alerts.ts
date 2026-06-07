// Alert engine. Phase 2: evaluates entries and records in-app alerts (deduped).
// Phase 3 extends sendAlert() to also deliver to Google Chat + email and adds
// scheduled pace/missing-entry checks.
import { db } from "./db";
import { getActiveReps, getSettings, resolveGoal } from "./data";
import { monthOf, paceFraction, todayStr } from "./date";
import { formatValue, type Unit } from "./format";
import { alertSeverity, statusVsGoal, statusVsPace } from "./kpi";
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
            .filter((r) => r.position === kpi.roleKey)
            .map((r) => ({ userId: r.id, userName: r.name }))
        : [{ userId: null, userName: null }];

    for (const subj of subjects) {
      const result = await evaluateOne(kpi, subj.userId, date, month, fraction);
      if (!result) continue; // no entry yet -> nothing to judge here

      const key = { kpiId: kpi.id, userId: subj.userId, date, severity };
      const existing = await db.alert.findFirst({ where: key });

      if (result.status === "miss") {
        const message = buildMessage(kpi, subj.userName, result);
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
          created.push({ ...key, expected: result.expected, actual: result.actual, message });
        } else if (existing.status === "resolved") {
          // It had recovered and slipped again — reopen with fresh numbers.
          await db.alert.update({
            where: { id: existing.id },
            data: { status: "open", expected: result.expected, actual: result.actual, message },
          });
          created.push({ ...key, expected: result.expected, actual: result.actual, message });
        } else {
          // Still open/ack — keep the numbers and message current.
          await db.alert.update({
            where: { id: existing.id },
            data: { expected: result.expected, actual: result.actual, message },
          });
        }
      } else if (existing && existing.status !== "resolved") {
        // Recovered to goal/pace — auto-resolve.
        await db.alert.update({ where: { id: existing.id }, data: { status: "resolved" } });
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
): Promise<{ status: ReturnType<typeof statusVsGoal>; expected: number; actual: number } | null> {
  const goal = await resolveGoal(kpi, kpi.scope === "per_rep" ? userId : null, month);
  if (goal === null) return null;

  if (kpi.cadence === "daily") {
    const entry = await db.entry.findFirst({ where: { kpiId: kpi.id, userId, date } });
    if (!entry) return null; // missing-entry handled by scheduled check (Phase 3)
    return { status: statusVsGoal(kpi.goalKind, entry.value, goal), expected: goal, actual: entry.value };
  }

  // monthly: month-to-date sum vs expected pace
  const { start } = monthBoundsLite(date);
  const entries = await db.entry.findMany({ where: { kpiId: kpi.id, date: { gte: start, lte: date } } });
  if (entries.length === 0) return null;
  const mtd = entries.reduce((s, e) => s + e.value, 0);
  return { status: statusVsPace(kpi.goalKind, mtd, goal, fraction), expected: goal * fraction, actual: mtd };
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

  const cfg = await getChannelConfig();
  const lines = hard.map((a) => a.message);
  const noun = hard.length === 1 ? "money KPI is" : "money KPIs are";
  const chatText =
    `🔴 *KPI alert* — ${hard.length} ${noun} behind target:\n` +
    lines.map((l) => `• ${l}`).join("\n");

  const chatOk = await sendGoogleChat(chatText, cfg);
  const emailOk = await sendEmail(
    `🔴 ${hard.length} money KPI alert${hard.length === 1 ? "" : "s"}`,
    alertEmailHtml("Money KPIs behind target", lines),
    cfg,
  );

  const channels = ["in_app"];
  if (chatOk) channels.push("google_chat");
  if (emailOk) channels.push("email");
  for (const a of hard) await recordChannels(a, channels);
}

// --- Missing-entry detection (scheduled) -------------------------------------

/** Reps who haven't logged a goal-bearing per-rep daily KPI raise a soft flag. */
export async function generateMissingEntryAlerts(date: string): Promise<NewAlert[]> {
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
    for (const rep of reps.filter((r) => r.position === kpi.roleKey)) {
      if (rep.irregularSchedule) continue; // no set schedule — don't nag on off days
      const entry = await db.entry.findFirst({ where: { kpiId: kpi.id, userId: rep.id, date } });
      if (entry) continue; // they logged something — nothing missing
      const existing = await db.alert.findFirst({
        where: { kpiId: kpi.id, userId: rep.id, date, severity },
      });
      if (existing) continue; // already flagged (missing or behind)
      const message = `${rep.name} hasn't logged ${kpi.name} today.`;
      await db.alert.create({
        data: { kpiId: kpi.id, userId: rep.id, date, severity, expected: kpi.goalValue ?? 0, actual: 0, message, status: "open" },
      });
      created.push({ kpiId: kpi.id, userId: rep.id, date, severity, expected: kpi.goalValue ?? 0, actual: 0, message });
    }
  }
  return created;
}

// --- Daily digest ------------------------------------------------------------

/** Send a single Chat + email digest of all open alerts for the date. */
export async function sendDailyDigest(date: string): Promise<boolean> {
  const open = await db.alert.findMany({
    where: { status: "open", date },
    orderBy: [{ severity: "asc" }],
  });
  if (open.length === 0) return false;

  const cfg = await getChannelConfig();
  const hard = open.filter((a) => a.severity === "hard");
  const soft = open.filter((a) => a.severity === "soft");
  const lines = open.map((a) => `${a.severity === "hard" ? "🔴" : "🔵"} ${a.message}`);

  const chatText =
    `📊 *Daily KPI digest* (${date}) — ${hard.length} money + ${soft.length} activity flags:\n` +
    lines.map((l) => `• ${l}`).join("\n");

  const chatOk = await sendGoogleChat(chatText, cfg);
  const emailOk = await sendEmail(
    `📊 Daily KPI digest — ${open.length} open flag${open.length === 1 ? "" : "s"}`,
    alertEmailHtml(`KPI digest — ${date}`, lines),
    cfg,
  );
  return chatOk || emailOk;
}

// --- Orchestrator (called by the cron route) ---------------------------------

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
}

/**
 * Full scheduled pass: re-evaluate today, flag missing entries (after the
 * workday cutoff), dispatch any new hard alerts, then send the daily digest.
 */
export async function runScheduledChecks(opts?: {
  date?: string;
  force?: boolean;
}): Promise<ScheduledResult> {
  const settings = await getSettings();
  const tz = settings.orgTimezone;
  const date = opts?.date ?? todayStr(tz);

  // Re-evaluate today's entries and record alerts in-app. External delivery
  // happens ONLY through the digest below, so Chat/email post exactly twice a
  // day (the two cron runs), never instantly on entry.
  const created = await evaluateAndRecordAlerts(date);

  // Missing-entry flags only after the workday cutoff — so the morning (8:30am)
  // digest doesn't nag about a day that just started, but the evening one does.
  let missing: NewAlert[] = [];
  if (opts?.force || pastCutoff(settings.workdayCutoff, tz)) {
    missing = await generateMissingEntryAlerts(date);
  }

  const digestSent = await sendDailyDigest(date);
  return { date, newAlerts: created.length, missing: missing.length, digestSent };
}
