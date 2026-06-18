import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, canAccessPayroll } from "@/lib/auth";
import { getAllUsers, getSettings } from "@/lib/data";
import { todayStr, payPeriod, datesInRange } from "@/lib/date";
import { workedMinutes } from "@/lib/presence";
import { workCapAt } from "@/lib/shift";
import { parseHourly, fmtHours } from "@/lib/payroll";
import { positionLabel } from "@/lib/roles";
import { saveTimeAdjustment, saveBonus, deleteBonus, savePayHours, savePayDiscrepancy, deleteOutage } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const LEAVE: Record<string, string> = { vacation: "Vacation", emergency: "Emergency", sick: "Sick", special: "Special", pto: "Time off", holiday: "Holiday", unpaid: "Unpaid" };
const clock = (d: Date | null) => (d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "—");
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekStartOf = (d: string) => { const dt = new Date(d + "T12:00:00Z"); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10); };
const mdShort = (d: string) => { const [, m, dd] = d.split("-").map(Number); return `${MON_SHORT[m - 1]} ${dd}`; };

export default async function TimecardPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Payroll — restricted</h1>
        <p className="mt-1 text-sm text-slate-500">Leadership only (Jon, Viktoriia, Enrico).</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const showPay = true; // page is leadership-only now
  const sp = await searchParams;
  const off = Number(sp.p ?? 0) || 0;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const period = payPeriod(today, off); // semi-monthly: 1–15 & 16–end
  const days = datesInRange(period.start, period.end);
  const now = new Date();

  const [users, profiles, punches, adjustments, timeOff, bonuses, payEntries, outages] = await Promise.all([
    getAllUsers(),
    db.teamProfile.findMany(),
    db.punch.findMany({ where: { date: { gte: period.start, lte: period.end } }, orderBy: { at: "asc" }, select: { userId: true, date: true, kind: true, at: true } }),
    db.timeAdjustment.findMany({ where: { date: { gte: period.start, lte: period.end } } }),
    db.timeOff.findMany({ where: { status: "approved", startDate: { lte: period.end }, endDate: { gte: period.start } }, select: { userId: true, type: true, startDate: true, endDate: true } }),
    db.bonus.findMany({ where: { periodKey: period.key }, orderBy: { createdAt: "asc" } }),
    db.payEntry.findMany({ where: { periodKey: period.key } }),
    db.outage.findMany({ where: { date: { gte: period.start, lte: period.end } }, orderBy: { startMin: "asc" } }),
  ]);
  const payEntryByUser = new Map(payEntries.map((p) => [p.userId, p]));
  const outageByDay = new Map<string, typeof outages>();
  for (const o of outages) { const k = `${o.userId}|${o.date}`; const a = outageByDay.get(k) ?? []; a.push(o); outageByDay.set(k, a); }
  const outageMin = (uid: string, d: string) => (outageByDay.get(`${uid}|${d}`) ?? []).reduce((s, o) => s + Math.max(0, o.endMin - o.startMin), 0);
  // Track everyone the company pays (incl. Marie, who is also an admin) — skip
  // only the owner (Jon) and part-timers (Ethan, irregular schedule).
  const active = users.filter((u) => u.active && !u.irregularSchedule && u.name.trim().split(/\s+/)[0]?.toLowerCase() !== "jon");
  const profByUser = new Map(profiles.map((p) => [p.userId ?? "", p]));
  const punchKey = (uid: string, d: string) => `${uid}|${d}`;
  const punchByDay = new Map<string, { kind: string; at: Date }[]>();
  for (const p of punches) { const k = punchKey(p.userId, p.date); const a = punchByDay.get(k) ?? []; a.push({ kind: p.kind, at: p.at }); punchByDay.set(k, a); }
  const adjByDay = new Map(adjustments.map((a) => [punchKey(a.userId, a.date), a]));
  const bonusByUser = new Map<string, typeof bonuses>();
  for (const b of bonuses) { const a = bonusByUser.get(b.userId) ?? []; a.push(b); bonusByUser.set(b.userId, a); }
  const offCovers = (uid: string, d: string) => timeOff.find((t) => t.userId === uid && t.startDate <= d && t.endDate >= d);

  return (
    <div className="space-y-5">
      <SectionTitle title="💵 Payroll — Time Card" subtitle={`Team hours by 2-week cycle (clock-in minus breaks, lunch, outages & time off).${showPay ? "" : " Pay totals are visible to leadership only."}`} accent="bg-emerald-500"
        right={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/timecard?p=${off - 1}`} className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-200">←</Link>
            <span className="font-bold text-slate-700">{period.label}</span>
            <Link href={`/timecard?p=${off + 1}`} className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-200">→</Link>
          </div>
        } />
      {showPay && <p className="text-xs text-slate-400">Semi-monthly: paid on the <strong>15th</strong> and the <strong>last day</strong> of each month (periods 1–15 & 16–end). Pay = paid hours × hourly rate + bonuses − discrepancies. Marie&apos;s entered hours are what pay; the clock-tracked hours are shown beside them as a check.</p>}

      {active.map((u) => {
        const prof = profByUser.get(u.id);
        const rate = parseHourly(prof?.payScale);
        const bonusRows = bonusByUser.get(u.id) ?? [];
        const bonusSum = bonusRows.reduce((s, b) => s + b.amount, 0);
        const pe = payEntryByUser.get(u.id);

        const rows = days.map((d) => {
          const ps = punchByDay.get(punchKey(u.id, d)) ?? [];
          const adj = adjByDay.get(punchKey(u.id, d));
          const leave = offCovers(u.id, d);
          const dow = new Date(d + "T12:00:00Z").getUTCDay();
          const workedH = ps.length ? workedMinutes(ps, now, workCapAt(d, settings.orgTimezone)) / 60 : 0;
          const outH = outageMin(u.id, d) / 60;
          const deduct = (adj?.deductHours ?? 0) + outH;
          const paidH = Math.max(0, workedH - deduct);
          const inAt = ps.find((p) => p.kind === "in")?.at ?? null;
          const outAt = [...ps].reverse().find((p) => p.kind === "out")?.at ?? null;
          let status = "—";
          if (workedH > 0) status = "Working";
          else if (leave) status = LEAVE[leave.type] ?? "Time off";
          else if (adj?.status === "day_off") status = "Day off";
          return { d, dow, workedH, deduct, outH, paidH, inAt, outAt, status, note: adj?.note ?? "", hasData: ps.length > 0 || !!leave || !!adj || outH > 0 };
        }).filter((r) => r.hasData);

        const autoPaidH = rows.reduce((s, r) => s + r.paidH, 0);
        const deductH = rows.reduce((s, r) => s + r.deduct, 0);
        const manualH = pe?.manualHours ?? null;
        const paidH = manualH != null ? manualH : autoPaidH; // Marie's entry is source of truth
        const variance = manualH != null ? manualH - autoPaidH : 0;
        const adjustAmt = pe?.adjustAmount ?? 0;
        const gross = rate != null ? paidH * rate : null;
        const total = (gross ?? 0) + bonusSum + adjustAmt;

        return (
          <Card key={u.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold text-slate-800">{u.name}</span>
              <span className="text-xs text-slate-400">{positionLabel(u.position)}</span>
              {showPay && <span className="ml-auto text-xs font-semibold text-slate-500">{rate != null ? `${money(rate)}/hr` : (prof?.payScale || "rate: see pay card")}</span>}
            </div>

            {/* Daily rows */}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-1.5 pr-3">Day</th><th className="px-2">In</th><th className="px-2">Out</th>
                    <th className="px-2 text-right">Worked</th><th className="px-2 text-right">Deduct</th><th className="px-2 text-right">Paid</th>
                    <th className="px-2">Status</th><th className="px-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={8} className="py-3 text-center text-slate-400">No activity this period.</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.d} className="border-b border-slate-50">
                      <td className="py-1.5 pr-3 font-medium text-slate-600">{WD[r.dow]} {r.d.slice(5)}</td>
                      <td className="px-2 text-slate-500">{clock(r.inAt)}</td>
                      <td className="px-2 text-slate-500">{clock(r.outAt)}</td>
                      <td className="px-2 text-right tabular-nums">{r.workedH > 0 ? fmtHours(r.workedH) : "—"}</td>
                      <td className="px-2 text-right tabular-nums text-red-600">{r.deduct > 0 ? `-${fmtHours(r.deduct)}` : ""}</td>
                      <td className="px-2 text-right font-semibold tabular-nums">{r.paidH > 0 ? fmtHours(r.paidH) : "—"}</td>
                      <td className="px-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${r.status === "Working" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{r.status}</span></td>
                      <td className="px-2 text-xs text-slate-500">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Weekly subtotals — read the period week by week */}
            {(() => {
              const weekly = new Map<string, number>();
              for (const r of rows) weekly.set(weekStartOf(r.d), (weekly.get(weekStartOf(r.d)) ?? 0) + r.paidH);
              const weeks = [...weekly.entries()].sort((a, b) => a[0].localeCompare(b[0]));
              if (weeks.length < 2) return null;
              return (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {weeks.map(([wk, h]) => (
                    <span key={wk} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Week of {mdShort(wk)}: <span className="tabular-nums text-slate-800">{fmtHours(h)}</span></span>
                  ))}
                </div>
              );
            })()}

            {/* Summary — Auto (clock) vs Marie's entered hours, then $ for leadership */}
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="text-slate-500">Clock-tracked <strong className="tabular-nums text-slate-700">{fmtHours(autoPaidH)}</strong></span>
              <span>Paid hours <strong className="tabular-nums">{fmtHours(paidH)}</strong>{manualH != null ? <span className="ml-1 text-[11px] text-slate-400">(entered)</span> : <span className="ml-1 text-[11px] text-slate-400">(auto)</span>}</span>
              {manualH != null && Math.abs(variance) >= 0.25 && (
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${variance > 0 ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                  {variance > 0 ? "+" : "−"}{fmtHours(Math.abs(variance))} vs clock
                </span>
              )}
              {showPay && gross != null && <span>Gross <strong className="tabular-nums">{money(gross)}</strong></span>}
              {showPay && bonusSum > 0 && <span>Bonuses <strong className="tabular-nums text-emerald-700">{money(bonusSum)}</strong></span>}
              {showPay && adjustAmt !== 0 && <span>Discrepancy <strong className={`tabular-nums ${adjustAmt < 0 ? "text-red-600" : "text-emerald-700"}`}>{money(adjustAmt)}</strong></span>}
              {showPay && <span className="ml-auto text-base">Pay this period <strong className="tabular-nums text-brand-navy">{gross != null || bonusSum || adjustAmt ? money(total) : "—"}</strong></span>}
            </div>

            {/* Outages reported this period */}
            {(() => {
              const us = outages.filter((o) => o.userId === u.id);
              if (us.length === 0) return null;
              const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
              return (
                <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                  <span className="font-bold">⚡ Outages (unpaid): </span>
                  {us.map((o) => (
                    <span key={o.id} className="mr-2 inline-flex items-center gap-1">
                      {o.date.slice(5)} {o.kind} {hhmm(o.startMin)}–{hhmm(o.endMin)}
                      <form action={deleteOutage} className="inline"><input type="hidden" name="id" value={o.id} /><button className="text-amber-400 hover:text-red-600">×</button></form>
                    </span>
                  ))}
                </div>
              );
            })()}

            {/* Marie's entered hours (source of truth for pay) */}
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <form action={savePayHours} className="rounded-lg ring-1 ring-slate-200 p-2.5">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Paid hours for this period (Marie)</div>
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="periodKey" value={period.key} />
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs"><span className="mb-0.5 block text-slate-500">Hours</span><input name="manualHours" type="number" step="0.01" defaultValue={manualH != null ? manualH : ""} placeholder={fmtHours(autoPaidH)} className={`${inputCls} w-24`} /></label>
                  <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">Save hours</button>
                  <span className="text-[11px] text-slate-400">Leave blank to use clock-tracked ({fmtHours(autoPaidH)}).</span>
                </div>
              </form>

              <form action={saveTimeAdjustment} className="rounded-lg ring-1 ring-slate-200 p-2.5">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Adjust a day (owed / note)</div>
                <input type="hidden" name="userId" value={u.id} />
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs"><span className="mb-0.5 block text-slate-500">Date</span>
                    <select name="date" className={inputCls} defaultValue={today >= period.start && today <= period.end ? today : period.start}>
                      {days.map((d) => <option key={d} value={d}>{WD[new Date(d + "T12:00:00Z").getUTCDay()]} {d.slice(5)}</option>)}
                    </select>
                  </label>
                  <label className="text-xs"><span className="mb-0.5 block text-slate-500">Deduct hrs</span><input name="deductHours" type="number" step="0.25" placeholder="0" className={`${inputCls} w-20`} /></label>
                  <label className="text-xs"><span className="mb-0.5 block text-slate-500">Status</span>
                    <select name="status" className={inputCls} defaultValue=""><option value="">auto</option><option value="day_off">Day off</option><option value="working">Working</option></select>
                  </label>
                  <input name="note" placeholder="note" className={`${inputCls} min-w-32 flex-1`} />
                  <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">Save</button>
                </div>
              </form>

              {showPay && (
              <div className="rounded-lg ring-1 ring-slate-200 p-2.5">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Bonuses this period</div>
                {bonusRows.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 text-xs">
                    <span className="font-semibold tabular-nums text-emerald-700">{money(b.amount)}</span>
                    <span className="text-slate-500">{b.note}</span>
                    <form action={deleteBonus} className="ml-auto"><input type="hidden" name="id" value={b.id} /><button className="text-slate-300 hover:text-red-600">×</button></form>
                  </div>
                ))}
                <form action={saveBonus} className="mt-1 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="periodKey" value={period.key} />
                  <input name="amount" type="number" step="0.01" placeholder="$ amount" className={`${inputCls} w-24`} />
                  <input name="note" placeholder="reason (e.g. closing bonus)" className={`${inputCls} min-w-32 flex-1`} />
                  <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Add</button>
                </form>
              </div>
              )}

              {showPay && (
              <form action={savePayDiscrepancy} className="rounded-lg ring-1 ring-slate-200 p-2.5">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Discrepancy / clawback ($)</div>
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="periodKey" value={period.key} />
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs"><span className="mb-0.5 block text-slate-500">Amount</span><input name="adjustAmount" type="number" step="0.01" defaultValue={adjustAmt || ""} placeholder="-36.00" className={`${inputCls} w-24`} /></label>
                  <input name="note" defaultValue={pe?.note ?? ""} placeholder="e.g. subtract 3h overpay" className={`${inputCls} min-w-32 flex-1`} />
                  <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">Save</button>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Use a negative number to claw back an overpay; positive to add owed pay.</p>
              </form>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
