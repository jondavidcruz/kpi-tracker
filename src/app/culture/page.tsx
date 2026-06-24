import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { getCurrentUser, isManager } from "@/lib/auth";
import { todayStr } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";
import { upcomingCulture, prettyMMDD, whenLabel, ordinal, type Person } from "@/lib/culture";
import { saveCultureDates, addTeamEvent, deleteTeamEvent } from "@/app/actions";

export const dynamic = "force-dynamic";

const IDEAS = [
  "Monthly team lunch (rotate who picks the spot)",
  "Friday wins round — everyone shares one win from the week",
  "Quarterly off-site / activity (bowling, top golf, escape room)",
  "Birthday shout-out + e-gift card on the day",
  "Work-anniversary spotlight in the Monday meeting",
  "Peer kudos channel — call out a teammate who helped you",
];

export default async function CulturePage() {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;
  const manager = isManager(me);
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);

  const [people, events] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, birthday: true, hireDate: true, position: true } }),
    db.teamEvent.findMany({ orderBy: { date: "asc" } }),
  ]);

  const persons: Person[] = people.map((p) => ({ name: p.name, birthday: p.birthday, hireDate: p.hireDate }));
  const upcoming = upcomingCulture(persons, today, 60);
  const todays = upcoming.filter((u) => u.daysUntil === 0);
  const birthdays = upcoming.filter((u) => u.kind === "birthday");
  const annivs = upcoming.filter((u) => u.kind === "anniversary");

  const upcomingEvents = events.filter((e) => e.date >= today);
  const pastEvents = events.filter((e) => e.date < today).reverse();
  const friendly = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-7">
      <SectionTitle title="🎉 Culture" subtitle="Birthdays, work anniversaries, and team building — never miss a chance to celebrate the team." accent="bg-pink-400" />

      {todays.length > 0 && (
        <Card className="border-0 bg-gradient-to-r from-pink-500 to-rose-500 p-5 text-white">
          <div className="text-sm font-semibold uppercase tracking-wide text-white/80">🎈 Today</div>
          {todays.map((u, i) => (
            <div key={i} className="mt-1 text-lg font-bold">
              {u.kind === "birthday" ? `🎂 Happy Birthday, ${u.name}!` : `🎉 ${u.name} — ${ordinal(u.years ?? 0)} work anniversary today!`}
            </div>
          ))}
        </Card>
      )}

      {/* Birthdays */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">🎂 Upcoming birthdays</h2>
        {birthdays.length === 0 ? (
          <Card className="p-4 text-sm text-slate-400">No birthdays in the next 60 days{manager ? " — add them below." : "."}</Card>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {birthdays.map((u, i) => (
              <Card key={i} className="flex items-center justify-between p-3">
                <div><div className="font-semibold text-slate-800">{u.name}</div><div className="text-xs text-slate-500">{prettyMMDD(u.mmdd)}</div></div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${u.daysUntil === 0 ? "bg-pink-100 text-pink-700" : "bg-slate-100 text-slate-600"}`}>{whenLabel(u.daysUntil)}</span>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Anniversaries */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">🎖️ Upcoming work anniversaries</h2>
        {annivs.length === 0 ? (
          <Card className="p-4 text-sm text-slate-400">No anniversaries in the next 60 days{manager ? " — add hire dates below." : "."}</Card>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {annivs.map((u, i) => (
              <Card key={i} className="flex items-center justify-between p-3">
                <div><div className="font-semibold text-slate-800">{u.name}</div><div className="text-xs text-slate-500">{ordinal(u.years ?? 0)} year · {prettyMMDD(u.mmdd)}</div></div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${u.daysUntil === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{whenLabel(u.daysUntil)}</span>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Team building events */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">🥳 Team building</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-2">
            {upcomingEvents.length === 0 && <Card className="p-4 text-sm text-slate-400">No events scheduled yet.</Card>}
            {upcomingEvents.map((e) => (
              <Card key={e.id} className="flex items-start justify-between gap-3 p-3">
                <div>
                  <div className="font-semibold text-slate-800">{e.title}</div>
                  <div className="text-xs text-slate-500">{friendly(e.date)}{e.notes ? ` · ${e.notes}` : ""}</div>
                </div>
                {manager && <form action={deleteTeamEvent}><input type="hidden" name="id" value={e.id} /><button className="text-slate-300 hover:text-red-600" title="Remove">✕</button></form>}
              </Card>
            ))}
            {pastEvents.length > 0 && (
              <details className="rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                <summary className="cursor-pointer font-semibold text-slate-500">Past events ({pastEvents.length})</summary>
                <ul className="mt-2 space-y-1 text-slate-500">{pastEvents.map((e) => <li key={e.id}>{friendly(e.date)} — {e.title}</li>)}</ul>
              </details>
            )}
          </div>
          <div>
            {manager && (
              <Card className="p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">+ Add an event</div>
                <form action={addTeamEvent} className="space-y-2">
                  <input name="title" placeholder="e.g. Team lunch at …" required className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                  <input type="date" name="date" required className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                  <input name="notes" placeholder="notes (optional)" className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                  <button className="w-full rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-navy-700">Add event</button>
                </form>
              </Card>
            )}
            <Card className="mt-2 bg-slate-50 p-3">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">💡 Ideas</div>
              <ul className="space-y-1 text-[13px] text-slate-600">{IDEAS.map((x, i) => <li key={i}>• {x}</li>)}</ul>
            </Card>
          </div>
        </div>
      </section>

      {/* Manager: set each person's dates */}
      {manager && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-700">⚙️ Set birthdays &amp; hire dates</h2>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-semibold">Team member</th><th className="px-3 py-2 font-semibold">Birthday</th><th className="px-3 py-2 font-semibold">Hire date</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-semibold text-slate-800">{p.name}</td>
                    <td colSpan={3} className="px-3 py-2">
                      <form action={saveCultureDates} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <label className="text-xs text-slate-400">Birthday<input type="date" name="birthday" defaultValue={p.birthday ? `2000-${p.birthday}` : ""} className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm" /></label>
                        <label className="text-xs text-slate-400">Hired<input type="date" name="hireDate" defaultValue={p.hireDate ?? ""} className="ml-1 rounded border border-slate-300 px-2 py-1 text-sm" /></label>
                        <button className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-300">Save</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[11px] text-slate-400">Birthdays celebrate the month/day only (year ignored). The team gets a 🎉 reminder in Google Chat on the morning of each birthday &amp; anniversary.</p>
          </Card>
        </section>
      )}
    </div>
  );
}
