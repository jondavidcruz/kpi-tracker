import { db } from "./db";
import { getSettings } from "./data";
import { sendEmailTo } from "./notify";
import { workedMinutes } from "./presence";
import { parseHourly, fmtHours } from "./payroll";
import { datesInRange, biweeklyPeriod } from "./date";
import { workCapAt } from "./shift";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Email the pay summary for the cycle ending on `payday` to the payroll recipients. */
export async function sendPayrollEmail(payday: string): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.payCycleAnchor) return false;
  const to = (settings.payrollEmails || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) return false;

  const period = biweeklyPeriod(payday, settings.payCycleAnchor, 0);
  const days = datesInRange(period.start, period.end);
  const [users, profiles, punches, adjustments, bonuses] = await Promise.all([
    db.user.findMany({ where: { active: true } }),
    db.teamProfile.findMany(),
    db.punch.findMany({ where: { date: { gte: period.start, lte: period.end } }, orderBy: { at: "asc" }, select: { userId: true, date: true, kind: true, at: true } }),
    db.timeAdjustment.findMany({ where: { date: { gte: period.start, lte: period.end } } }),
    db.bonus.findMany({ where: { periodKey: period.key } }),
  ]);
  const active = users.filter((u) => u.active && !u.irregularSchedule && u.name.trim().split(/\s+/)[0]?.toLowerCase() !== "jon");
  const profByUser = new Map(profiles.map((p) => [p.userId ?? "", p]));
  const punchByDay = new Map<string, { kind: string; at: Date }[]>();
  for (const p of punches) { const k = `${p.userId}|${p.date}`; const a = punchByDay.get(k) ?? []; a.push({ kind: p.kind, at: p.at }); punchByDay.set(k, a); }
  const adjByDay = new Map(adjustments.map((a) => [`${a.userId}|${a.date}`, a]));
  const bonusByUser = new Map<string, number>();
  for (const b of bonuses) bonusByUser.set(b.userId, (bonusByUser.get(b.userId) ?? 0) + b.amount);
  const now = new Date();

  let totalPay = 0;
  const rows = active.map((u) => {
    const rate = parseHourly(profByUser.get(u.id)?.payScale);
    let workedH = 0, deductH = 0;
    for (const d of days) {
      const ps = punchByDay.get(`${u.id}|${d}`) ?? [];
      // Cap each day at its scheduled shift end so a forgotten clock-out can't
      // inflate pay — never counts past the shift, even if never closed.
      if (ps.length) workedH += workedMinutes(ps, now, workCapAt(d, settings.orgTimezone)) / 60;
      const adj = adjByDay.get(`${u.id}|${d}`);
      if (adj) deductH += adj.deductHours;
    }
    const paidH = Math.max(0, workedH - deductH);
    const bonus = bonusByUser.get(u.id) ?? 0;
    const gross = rate != null ? paidH * rate : null;
    const total = (gross ?? 0) + bonus;
    totalPay += total;
    return { name: u.name, paidH, rate, gross, bonus, total };
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
    <p style="color:#94a3b8;font-size:12px;margin-top:14px">Open the Time Card in the War Room for the day-by-day breakdown.</p>
  </div>`;
  return sendEmailTo(to, `💵 Payday summary — ${period.label} (${money(totalPay)})`, html);
}
