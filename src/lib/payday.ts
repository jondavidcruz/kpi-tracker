import { db } from "./db";
import { getSettings } from "./data";
import { sendEmailTo } from "./notify";
import { workedMinutes, paidMinutes } from "./presence";
import { parseHourly, parseFlatDailyHours, fmtHours } from "./payroll";
import { datesInRange, payPeriod } from "./date";
import { workCapAt, shiftStartAt } from "./shift";

const PAID_BREAK_MIN = 15; // team policy: one paid break up to 15 min/day

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Email the pay summary for the semi-monthly period containing `payday`. */
export async function sendPayrollEmail(payday: string): Promise<boolean> {
  const settings = await getSettings();
  const to = (settings.payrollEmails || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) return false;

  const period = payPeriod(payday, 0); // semi-monthly period containing the payday
  const days = datesInRange(period.start, period.end);
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
  const profByUser = new Map(profiles.map((p) => [p.userId ?? "", p]));
  const punchByDay = new Map<string, { kind: string; at: Date }[]>();
  for (const p of punches) { const k = `${p.userId}|${p.date}`; const a = punchByDay.get(k) ?? []; a.push({ kind: p.kind, at: p.at }); punchByDay.set(k, a); }
  const adjByDay = new Map(adjustments.map((a) => [`${a.userId}|${a.date}`, a]));
  const bonusByUser = new Map<string, number>();
  for (const b of bonuses) bonusByUser.set(b.userId, (bonusByUser.get(b.userId) ?? 0) + b.amount);
  const payEntryByUser = new Map(payEntries.map((p) => [p.userId, p]));
  const outageMinByDay = new Map<string, number>();
  for (const o of outages) { const k = `${o.userId}|${o.date}`; outageMinByDay.set(k, (outageMinByDay.get(k) ?? 0) + Math.max(0, o.endMin - o.startMin)); }
  const now = new Date();

  let totalPay = 0;
  const hoursWatch: string[] = []; // salaried mgmt who came up short on actual hours
  const rows = active.map((u) => {
    const payScale = profByUser.get(u.id)?.payScale;
    const rate = parseHourly(payScale);
    const flatH = parseFlatDailyHours(payScale); // salaried mgmt: paid Nh flat M–F
    let rawH = 0;    // actual on-the-clock (for the flat-hours shortfall watch)
    let policyH = 0; // policy pay hours: no early/late, lunch unpaid, one paid 15-min break
    let weekdays = 0;
    for (const d of days) {
      const ps = punchByDay.get(`${u.id}|${d}`) ?? [];
      // Cap each day at its scheduled shift end so a forgotten clock-out can't
      // inflate pay — never counts past the shift, even if never closed.
      const cap = workCapAt(d, settings.orgTimezone, u.name);
      const floorMs = shiftStartAt(d, settings.orgTimezone, u.name)?.getTime() ?? null;
      const ded = (adjByDay.get(`${u.id}|${d}`)?.deductHours ?? 0) + (outageMinByDay.get(`${u.id}|${d}`) ?? 0) / 60; // adjustments + outages, unpaid
      if (ps.length) {
        rawH += Math.max(0, workedMinutes(ps, now, cap) / 60 - ded);
        policyH += Math.max(0, paidMinutes(ps, now, cap, floorMs, PAID_BREAK_MIN) / 60 - ded);
      }
      const dow = new Date(d + "T12:00:00Z").getUTCDay();
      if (dow >= 1 && dow <= 5) weekdays++;
    }
    const pe = payEntryByUser.get(u.id);
    // Flat-hours people are paid Nh per weekday regardless of clock; everyone else
    // is paid manual-entered hours (if any) else policy-adjusted clock hours.
    const flatExpected = flatH != null ? flatH * weekdays : null;
    const paidH = flatExpected != null ? flatExpected : (pe?.manualHours != null ? pe.manualHours : policyH);
    if (flatExpected != null && rawH + 0.05 < flatExpected) {
      hoursWatch.push(`${u.name} actually worked ${fmtHours(rawH)} of ${fmtHours(flatExpected)} expected (paid the flat ${fmtHours(flatExpected)} — short ${fmtHours(flatExpected - rawH)} on the clock).`);
    }
    const bonus = bonusByUser.get(u.id) ?? 0;
    const adjustAmt = pe?.adjustAmount ?? 0;
    const gross = rate != null ? paidH * rate : null;
    const total = (gross ?? 0) + bonus + adjustAmt;
    totalPay += total;
    return { name: u.name + (flatH != null ? " (flat M–F)" : ""), paidH, rate, gross, bonus, total };
  });

  const tr = rows
    .map((r) => `<tr>
      <td style="padding:6px 10px;border-top:1px solid #eef2f7">${r.name}</td>
      <td style="padding:6px 10px;border-top:1px solid #eef2f7;text-align:right">${fmtHours(r.paidH)}</td>
      <td style="padding:6px 10px;border-top:1px solid #eef2f7;text-align:right">${r.rate != null ? money(r.rate) : "—"}</td>
      <td style="padding:6px 10px;border-top:1px solid #eef2f7;text-align:right">${r.gross != null ? money(r.gross) : "see pay card"}</td>
      <td style="padding:6px 10px;border-top:1px solid #eef2f7;text-align:right">${r.bonus ? money(r.bonus) : "—"}</td>
      <td style="padding:6px 10px;border-top:1px solid #eef2f7;text-align:right;font-weight:700">${r.gross != null || r.bonus ? money(r.total) : "—"}</td>
    </tr>`)
    .join("");

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:660px;margin:0 auto;color:#0f172a">
    <h2 style="color:#0b1f3a;margin:0 0 4px">💵 Payday — ${period.label}</h2>
    <p style="color:#64748b;margin:0 0 12px">Cycle ${period.start} → ${period.end}. Paid hours = clocked-in time minus breaks, lunch, outages &amp; time off (all unpaid).</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <thead><tr style="background:#f8fafc;text-align:left">
        <th style="padding:7px 10px">Person</th><th style="padding:7px 10px;text-align:right">Paid hrs</th><th style="padding:7px 10px;text-align:right">Rate</th><th style="padding:7px 10px;text-align:right">Gross</th><th style="padding:7px 10px;text-align:right">Bonus</th><th style="padding:7px 10px;text-align:right">Total</th>
      </tr></thead>
      <tbody>${tr}</tbody>
      <tfoot><tr style="border-top:2px solid #0b1f3a;font-weight:800"><td style="padding:8px 10px" colspan="5">Total payroll</td><td style="padding:8px 10px;text-align:right">${money(totalPay)}</td></tr></tfoot>
    </table>
    ${hoursWatch.length ? `<div style="margin-top:14px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#92400e">
      <strong>⏱️ Hours watch (paid flat regardless):</strong>
      <ul style="margin:6px 0 0;padding-left:18px">${hoursWatch.map((n) => `<li>${n}</li>`).join("")}</ul>
    </div>` : ""}
    <p style="color:#94a3b8;font-size:12px;margin-top:14px">Open the Time Card in the War Room for the day-by-day breakdown.</p>
  </div>`;
  return sendEmailTo(to, `💵 Payday summary — ${period.label} (${money(totalPay)})`, html);
}
