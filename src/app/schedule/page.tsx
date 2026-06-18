import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr, monthOf, monthBounds, friendlyDate } from "@/lib/date";
import { stateFromPunches, workedMinutes, groupByUser } from "@/lib/presence";
import { requestTimeOff, setTimeOffStatus, deleteTimeOff } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";
import PresenceBoard from "@/components/PresenceBoard";
import TimeClock from "@/components/TimeClock";

export const dynamic = "force-dynamic";

const TYPE_META: Record<string, { label: string; cls: string }> = {
  vacation: { label: "Vacation", cls: "bg-sky-100 text-sky-700" },
  emergency: { label: "Emergency", cls: "bg-red-100 text-red-700" },
  sick: { label: "Sick", cls: "bg-rose-100 text-rose-700" },
  special: { label: "Special / Birthday", cls: "bg-violet-100 text-violet-700" },
  // legacy values still render:
  pto: { label: "Time off", cls: "bg-slate-200 text-slate-700" },
  holiday: { label: "Holiday", cls: "bg-slate-200 text-slate-700" },
  unpaid: { label: "Unpaid", cls: "bg-slate-200 text-slate-700" },
};
const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const month = monthOf(today);
  const mb = monthBounds(today);
  const manager = isManager(me);

  const [users, punchesToday, timeOff] = await Promise.all([
    db.user.findMany({ where: { active: true, irregularSchedule: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.punch.findMany({ where: { date: today }, orderBy: { at: "asc" }, select: { userId: true, kind: true, at: true } }),
    db.timeOff.findMany({ include: { user: { select: { name: true } } }, orderBy: { startDate: "asc" } }),
  ]);

  // Presence (initial render; PresenceBoard then polls live).
  const byUser = groupByUser(punchesToday);
  const now = new Date();
  const people = users.map((u) => {
    const ps = byUser.get(u.id) ?? [];
    const { state, since } = stateFromPunches(ps);
    return { id: u.id, name: u.name, state, sinceMs: since ? since.getTime() : null, workedMin: workedMinutes(ps, now) };
  });

  // My time card today.
  const myPs = byUser.get(me.id) ?? [];
  const myState = stateFromPunches(myPs);
  const myWorked = workedMinutes(myPs, now);

  // Time off: this month's grid, pending approvals, upcoming list.
  const monthOff = timeOff.filter((t) => t.status !== "denied" && t.startDate <= mb.end && t.endDate >= mb.start);
  const pending = timeOff.filter((t) => t.status === "requested");
  const upcoming = timeOff.filter((t) => t.endDate >= today && t.status !== "denied").slice(0, 12);

  // Build month grid cells.
  const [y, m] = month.split("-").map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: ({ date: string; day: number } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: `${month}-${String(d).padStart(2, "0")}`, day: d });

  const offOnDay = (date: string) => monthOff.filter((t) => t.startDate <= date && t.endDate >= date);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="🗓️ Schedule & Time"
        subtitle="Live team availability, your time card, and time-off requests — all in one place."
        accent="bg-indigo-400"
        right={<span className="text-sm font-semibold text-slate-500">{friendlyDate(today)}</span>}
      />

      {/* LIVE AVAILABILITY */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-slate-700">Who&apos;s available right now</h3>
        <Card className="p-4">
          <PresenceBoard initial={people} />
        </Card>
      </section>

      {/* MY TIME CARD */}
      <section>
        <TimeClock state={myState.state} sinceMs={myState.since ? myState.since.getTime() : null} workedMin={myWorked} nowMs={now.getTime()} />
      </section>

      {/* TIME OFF */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Request form */}
        <Card className="p-5 lg:col-span-1" id="request">
          <h3 className="mb-1 text-sm font-bold text-slate-700">Request time off</h3>
          <p className="mb-3 text-xs text-slate-500">All time off is <strong>unpaid</strong>. {manager ? "Yours is approved automatically." : "Marie or Jon will approve it."}</p>
          <form action={requestTimeOff} className="space-y-2">
            <label className="block"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Type</span>
              <select name="type" className={inputCls} defaultValue="vacation">
                <option value="vacation">Vacation</option>
                <option value="emergency">Emergency leave</option>
                <option value="sick">Sick</option>
                <option value="special">Special event (e.g. birthday)</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">From</span>
                <input type="date" name="startDate" required defaultValue={sp.from ?? today} className={inputCls} />
              </label>
              <label className="block"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">To</span>
                <input type="date" name="endDate" defaultValue={sp.from ?? today} className={inputCls} />
              </label>
            </div>
            <label className="block"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Note (optional)</span>
              <input name="note" placeholder="e.g. family trip" className={inputCls} />
            </label>
            <button className="w-full rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Submit request</button>
          </form>
          <p className="mt-2 text-[11px] text-slate-400">Approved time off syncs to the shared team Google Calendar (once connected).</p>
        </Card>

        {/* Calendar */}
        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-2 text-sm font-bold text-slate-700">{new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h3>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-slate-400">
            {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) => {
              if (!c) return <div key={i} />;
              const offs = offOnDay(c.date);
              const isToday = c.date === today;
              return (
                <Link
                  key={i}
                  href={`/schedule?from=${c.date}#request`}
                  className={`min-h-16 rounded-lg border p-1 text-left transition hover:border-brand-navy/40 ${isToday ? "border-brand-navy bg-brand-navy/5" : "border-slate-200 bg-white"}`}
                >
                  <div className={`text-[11px] font-bold ${isToday ? "text-brand-navy" : "text-slate-500"}`}>{c.day}</div>
                  <div className="mt-0.5 space-y-0.5">
                    {offs.slice(0, 3).map((t) => (
                      <div key={t.id} className={`truncate rounded px-1 py-0.5 text-[9px] font-semibold ${TYPE_META[t.type]?.cls ?? "bg-slate-100 text-slate-600"} ${t.status === "requested" ? "opacity-60" : ""}`}>
                        {t.user.name.split(" ")[0]}{t.status === "requested" ? " ?" : ""}
                      </div>
                    ))}
                    {offs.length > 3 && <div className="text-[9px] text-slate-400">+{offs.length - 3}</div>}
                  </div>
                </Link>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Click a day to request it off. Faded = pending approval.</p>
        </Card>
      </section>

      {/* PENDING APPROVALS (managers) */}
      {manager && pending.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-slate-700">Pending approvals ({pending.length})</h3>
          <Card className="divide-y divide-slate-100">
            {pending.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${TYPE_META[t.type]?.cls ?? "bg-slate-100"}`}>{TYPE_META[t.type]?.label ?? t.type}</span>
                <span className="font-semibold text-slate-800">{t.user.name}</span>
                <span className="text-sm text-slate-500">{t.startDate}{t.endDate !== t.startDate ? ` → ${t.endDate}` : ""}{t.note ? ` · ${t.note}` : ""}</span>
                <div className="ml-auto flex gap-2">
                  <form action={setTimeOffStatus}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="approved" /><button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Approve</button></form>
                  <form action={setTimeOffStatus}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="denied" /><button className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300">Deny</button></form>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* UPCOMING TIME OFF */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-slate-700">Upcoming time off</h3>
        <Card className="divide-y divide-slate-100">
          {upcoming.length === 0 && <div className="p-6 text-center text-sm text-slate-400">Nothing scheduled.</div>}
          {upcoming.map((t) => {
            const canDelete = t.userId === me.id || manager;
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${TYPE_META[t.type]?.cls ?? "bg-slate-100"}`}>{TYPE_META[t.type]?.label ?? t.type}</span>
                <span className="font-semibold text-slate-800">{t.user.name}</span>
                <span className="text-sm text-slate-500">{t.startDate}{t.endDate !== t.startDate ? ` → ${t.endDate}` : ""}{t.note ? ` · ${t.note}` : ""}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{t.status === "approved" ? "approved" : "pending"}</span>
                {t.gcalEventId && <span title="On the team Google Calendar" className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">✓ Google Calendar</span>}
                {canDelete && (
                  <form action={deleteTimeOff} className="ml-auto"><input type="hidden" name="id" value={t.id} /><button className="text-[11px] font-medium text-slate-300 hover:text-red-600">Remove</button></form>
                )}
              </div>
            );
          })}
        </Card>
      </section>
    </div>
  );
}
