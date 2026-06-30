// Builds a compact, PERMISSION-AWARE data summary for whatever War Room screen
// the user has open, so the Cortana assistant can analyze real numbers — never
// surfacing pay figures to someone who can't already see them in the app.
import { db } from "./db";
import { getSettings } from "./data";
import { todayStr, payPeriod, datesInRange } from "./date";
import { workedMinutes, stateFromPunches, groupByUser } from "./presence";
import { workCapAt } from "./shift";
import { parseHourly, fmtHours } from "./payroll";
import { canAccessPayroll, canTrackTime, isManager } from "./auth";
import type { User } from "@prisma/client";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export async function buildAssistantContext(path: string, me: User): Promise<string> {
  const p = (path || "").split("?")[0];
  try {
    if (p.startsWith("/timecard")) return await payrollContext(me);
    if (p.startsWith("/internet")) return await internetContext(me);
    if (p.startsWith("/schedule")) return await scheduleContext(me);
    if (p.startsWith("/alerts")) return await alertsContext(me);
    if (p.startsWith("/dashboard") || p === "/") return await dashboardContext();
  } catch {
    return "";
  }
  return "";
}

async function payrollContext(me: User): Promise<string> {
  if (!canTrackTime(me)) return "This user cannot view payroll, so do not discuss specific pay figures.";
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const period = payPeriod(today, 0);
  const days = datesInRange(period.start, period.end);
  const showPay = canAccessPayroll(me);
  const [users, profiles, punches, adjustments, bonuses, payEntries, outages] = await Promise.all([
    db.user.findMany({ where: { active: true } }),
    db.teamProfile.findMany(),
    db.punch.findMany({ where: { date: { gte: period.start, lte: period.end } }, orderBy: { at: "asc" }, select: { userId: true, date: true, kind: true, at: true } }),
    db.timeAdjustment.findMany({ where: { date: { gte: period.start, lte: period.end } } }),
    db.bonus.findMany({ where: { periodKey: period.key } }),
    db.payEntry.findMany({ where: { periodKey: period.key } }),
    db.outage.findMany({ where: { date: { gte: period.start, lte: period.end } } }),
  ]);
  const active = users.filter((u) => u.active && !u.irregularSchedule && u.name.trim().split(/\s+/)[0]?.toLowerCase() !== "jon");
  const profByUser = new Map(profiles.map((pr) => [pr.userId ?? "", pr]));
  const punchByDay = new Map<string, { kind: string; at: Date }[]>();
  for (const pu of punches) { const k = `${pu.userId}|${pu.date}`; const a = punchByDay.get(k) ?? []; a.push({ kind: pu.kind, at: pu.at }); punchByDay.set(k, a); }
  const adjByDay = new Map(adjustments.map((a) => [`${a.userId}|${a.date}`, a]));
  const outMin = new Map<string, number>();
  for (const o of outages) { const k = `${o.userId}|${o.date}`; outMin.set(k, (outMin.get(k) ?? 0) + Math.max(0, o.endMin - o.startMin)); }
  const bonusByUser = new Map<string, number>();
  for (const b of bonuses) bonusByUser.set(b.userId, (bonusByUser.get(b.userId) ?? 0) + b.amount);
  const payByUser = new Map(payEntries.map((pe) => [pe.userId, pe]));
  const now = new Date();

  const lines: string[] = [];
  for (const u of active) {
    let autoH = 0;
    for (const d of days) {
      const ps = punchByDay.get(`${u.id}|${d}`) ?? [];
      let dh = ps.length ? workedMinutes(ps, now, workCapAt(d, settings.orgTimezone, u.name)) / 60 : 0;
      dh -= adjByDay.get(`${u.id}|${d}`)?.deductHours ?? 0;
      dh -= (outMin.get(`${u.id}|${d}`) ?? 0) / 60;
      autoH += Math.max(0, dh);
    }
    const pe = payByUser.get(u.id);
    const paidH = pe?.manualHours != null ? pe.manualHours : autoH;
    let line = `- ${u.name}: paid ${fmtHours(paidH)} (clock-tracked ${fmtHours(autoH)}${pe?.manualHours != null ? ", entered by Marie" : ""})`;
    if (showPay) {
      const rate = parseHourly(profByUser.get(u.id)?.payScale);
      const bonus = bonusByUser.get(u.id) ?? 0;
      const adj = pe?.adjustAmount ?? 0;
      const gross = rate != null ? paidH * rate : null;
      const total = (gross ?? 0) + bonus + adj;
      line += rate != null ? ` · ${money(rate)}/hr · gross ${money(gross!)}${bonus ? ` · bonus ${money(bonus)}` : ""}${adj ? ` · adj ${money(adj)}` : ""} · total ${money(total)}` : ` · rate not set`;
    }
    lines.push(line);
  }
  return `PAYROLL — current pay period ${period.label} (${period.start} to ${period.end}), semi-monthly (paid the 15th & last day).${showPay ? "" : " (This user tracks hours but CANNOT see pay $ — give hours analysis only, no dollar figures.)"}\n${lines.join("\n")}`;
}

async function internetContext(me: User): Promise<string> {
  if (!isManager(me)) return "This user is not a manager; internet alerts are manager-only.";
  const kpi = await db.kpi.findFirst({ where: { roleKey: "internet" }, select: { id: true, goalValue: true } });
  if (!kpi) return "No internet-speed KPI is configured.";
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const [entries, users] = await Promise.all([
    db.entry.findMany({ where: { kpiId: kpi.id, date: { gte: since } }, orderBy: { date: "desc" }, select: { userId: true, date: true, value: true } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const byUser = new Map<string, { date: string; value: number }[]>();
  for (const e of entries) { if (!e.userId) continue; const a = byUser.get(e.userId) ?? []; a.push({ date: e.date, value: e.value }); byUser.set(e.userId, a); }
  const lines: string[] = [];
  for (const [uid, arr] of byUser) {
    const avg = arr.reduce((s, x) => s + x.value, 0) / arr.length;
    const latest = arr[0];
    lines.push(`- ${nameById.get(uid) ?? "?"}: latest ${latest.value} Mbps (${latest.date}), 14-day avg ${avg.toFixed(0)} Mbps, ${arr.length} readings`);
  }
  return `INTERNET SPEED — goal ${kpi.goalValue}+ Mbps. Last 14 days:\n${lines.join("\n") || "No readings yet."}`;
}

async function scheduleContext(me: User): Promise<string> {
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const [users, punches, pendingOff] = await Promise.all([
    db.user.findMany({ where: { active: true, irregularSchedule: false }, select: { id: true, name: true } }),
    db.punch.findMany({ where: { date: today }, orderBy: { at: "asc" }, select: { userId: true, kind: true, at: true } }),
    db.timeOff.count({ where: { status: "requested" } }),
  ]);
  const byUser = groupByUser(punches);
  const lines = users
    .filter((u) => u.name.trim().split(/\s+/)[0]?.toLowerCase() !== "jon")
    .map((u) => `- ${u.name}: ${stateFromPunches(byUser.get(u.id) ?? []).state}`);
  return `SCHEDULE & TIME (today ${today}):\n${lines.join("\n")}\nPending time-off requests awaiting approval: ${pendingOff}.`;
}

async function alertsContext(me: User): Promise<string> {
  if (!isManager(me)) return "Alerts are manager-only.";
  const open = await db.alert.count({ where: { status: "open" } });
  return `ALERTS: ${open} alert(s) currently open/unresolved. Marie should justify or resolve each by end of day (7pm).`;
}

async function dashboardContext(): Promise<string> {
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const [reps, todays] = await Promise.all([
    db.user.findMany({ where: { active: true, position: { not: "" } }, select: { id: true, name: true } }),
    db.entry.findMany({ where: { date: today }, select: { userId: true } }),
  ]);
  const logged = new Set(todays.map((e) => e.userId));
  const missing = reps.filter((r) => !logged.has(r.id)).map((r) => r.name);
  return `DASHBOARD (today ${today}): ${reps.length} reps with scorecards; ${logged.size} have logged at least one KPI today. Not yet logged: ${missing.length ? missing.join(", ") : "everyone is in"}.`;
}
