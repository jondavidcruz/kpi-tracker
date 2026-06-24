import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { getCurrentUser, isManager } from "@/lib/auth";
import { todayStr } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";
import { upcomingCulture, prettyMMDD, whenLabel, ordinal, type Person } from "@/lib/culture";
import { addTeamEvent, deleteTeamEvent } from "@/app/actions";
import Link from "next/link";

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

  // Birthdays + start dates live in the Team Roster (TeamProfile) — pull from there so
  // there's one source of truth, no double entry.
  const [users, profiles, events] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true } }),
    db.teamProfile.findMany({ orderBy: { name: "asc" }, select: { userId: true, name: true, birthday: true, startDate: true } }),
    db.teamEvent.findMany({ orderBy: { date: "asc" } }),
  ]);
  const activeIds = new Set(users.map((u) => u.id));
  const persons: Person[] = profiles
    .filter((p) => !p.userId || activeIds.has(p.userId))
    .map((p) => ({
      name: p.name,
      birthday: /^\d{4}-\d{2}-\d{2}$/.test(p.birthday) ? p.birthday.slice(5) : null,
      hireDate: /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) ? p.startDate : null,
    }));
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

      <Card className="bg-slate-50 p-4 text-[13px] text-slate-500">
        Birthdays &amp; start dates are pulled from the <Link href="/team-roster" className="font-semibold text-brand-navy hover:underline">Team Roster</Link> (owner-only HR records) — edit them there and they show up here. The team gets a 🎉 reminder in Google Chat on the morning of each birthday &amp; anniversary (year is hidden — only the day is celebrated).
      </Card>
    </div>
  );
}
