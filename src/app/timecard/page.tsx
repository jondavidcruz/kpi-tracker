import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, canAccessPayroll, canTrackTime } from "@/lib/auth";
import { getAllUsers, getSettings } from "@/lib/data";
import { todayStr, payPeriod, datesInRange } from "@/lib/date";
import { workedMinutes } from "@/lib/presence";
import { parseHourly, fmtHours } from "@/lib/payroll";
import { positionLabel } from "@/lib/roles";
import { saveTimeAdjustment, saveBonus, deleteBonus } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const LEAVE: Record<string, string> = { vacation: "Vacation", emergency: "Emergency", sick: "Sick", special: "Special", pto: "Time off", holiday: "Holiday", unpaid: "Unpaid" };
const clock = (d: Date | null) => (d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "—");

export default async function TimecardPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const me = await getCurrentUser();
  if (!canTrackTime(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Time Card — restricted</h1>
        <p className="mt-1 text-sm text-slate-500">Managers only.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const showPay = canAccessPayroll(me); // $ figures — leadership only (Jon/Viktoriia/Enrico)
  const sp = await searchParams;
  const off = Number(sp.p ?? 0) || 0;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const period = payPeriod(today, off);
  const days = datesInRange(period.start, period.end);
  const now = new Date();

  const [users, profiles, punches, adjustments, timeOff, bonuses] = await Promise.all([
    getAllUsers(),
    db.teamProfile.findMany(),
    db.punch.findMany({ where: { date: { gte: period.start, lte: period.end } }, orderBy: { at: "asc" }, select: { userId: true, date: true, kind: true, at: true } }),
    db.timeAdjustment.findMany({ where: { date: { gte: period.start, lte: period.end } } }),
    db.timeOff.findMany({ where: { status: "approved", startDate: { lte: period.end }, endDate: { gte: period.start } }, select: { userId: true, type: true, startDate: true, endDate: true } }),
    db.bonus.findMany({ where: { periodKey: period.key }, orderBy: { createdAt: "asc" } }),
  ]);
  const active = users.filter((u) => u.active && u.role !== "admin" && !u.irregularSchedule); // skip owner + part-timers (Ethan)
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
      <SectionTitle title={showPay ? "⏱️ Time Card & Pay" : "⏱️ Time Card"} subtitle="Hours from clock-in/out, minus breaks, lunch, outages & time off. Not counted: breaks, days off, sick, vacation, outages." accent="bg-emerald-500"
        right={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/timecard?p=${off - 1}`} className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-200">←</Link>
            <span className="font-bold text-slate-700">{period.label}</span>
            <Link href={`/timecard?p=${off + 1}`} className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-200">→</Link>
          </div>
        } />
      {showPay && <p className="text-xs text-slate-400">Pays on the 1st &amp; 15th (each ~2 working weeks). Pay = paid hours × hourly rate + bonuses.</p>}

      {active.map((u) => {
        const prof = profByUser.get(u.id);
        const rate = parseHourly(prof?.payScale);
        const bonusRows = bonusByUser.get(u.id) ?? [];
        const bonusSum = bonusRows.reduce((s, b) => s + b.amount, 0);

        const rows = days.map((d) => {
          const ps = punchByDay.get(punchKey(u.id, d)) ?? [];
          const adj = adjByDay.get(punchKey(u.id, d));
          const leave = offCovers(u.id, d);
          const dow = new Date(d + "T12:00:00Z").getUTCDay();
          const workedH = ps.length ? workedMinutes(ps, now) / 60 : 0;
          const deduct = adj?.deductHours ?? 0;
          const paidH = Math.max(0, workedH - deduct);
          const inAt = ps.find((p) => p.kind === "in")?.at ?? null;
          const outAt = [...ps].reverse().find((p) => p.kind === "out")?.at ?? null;
          let status = "—";
          if (workedH > 0) status = "Working";
          else if (leave) status = LEAVE[leave.type] ?? "Time off";
          else if (adj?.status === "day_off") status = "Day off";
          return { d, dow, workedH, deduct, paidH, inAt, outAt, status, note: adj?.note ?? "", hasData: ps.length > 0 || !!leave || !!adj };
        }).filter((r) => r.hasData);

        const workedH = rows.reduce((s, r) => s + r.workedH, 0);
        const deductH = rows.reduce((s, r) => s + r.deduct, 0);
        const paidH = Math.max(0, workedH - deductH);
        const gross = rate != null ? paidH * rate : null;
        const total = (gross ?? 0) + bonusSum;

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

            {/* Summary — hours always; $ only for leadership */}
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>Paid hours <strong className="tabular-nums">{fmtHours(paidH)}</strong></span>
              {showPay && gross != null && <span>Gross <strong className="tabular-nums">{money(gross)}</strong></span>}
              {showPay && bonusSum > 0 && <span>Bonuses <strong className="tabular-nums text-emerald-700">{money(bonusSum)}</strong></span>}
              {showPay && <span className="ml-auto text-base">Pay this period <strong className="tabular-nums text-brand-navy">{gross != null || bonusSum ? money(total) : "—"}</strong></span>}
            </div>

            {/* Manager tools: adjust a day + bonuses */}
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <form action={saveTimeAdjustment} className="rounded-lg ring-1 ring-slate-200 p-2.5">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Adjust a day (outage / owed / note)</div>
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
                  <input name="note" placeholder="Power outage 1:27–2:56…" className={`${inputCls} min-w-40 flex-1`} />
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
            </div>
          </Card>
        );
      })}
    </div>
  );
}
