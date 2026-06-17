// Authenticated app shell: left sidebar + content. Also enforces the lockout
// (removed/deactivated accounts are signed out). Login and the public wall
// display render without chrome.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionEmail, getCurrentUser, isManager, isAdmin, canAccessMarketing } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import Sidebar from "./Sidebar";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const email = await getSessionEmail();
  const me = email ? await getCurrentUser() : null;

  // Removed/deactivated account with a lingering session → sign out.
  if (email && (!me || !me.active)) redirect("/auth/signout");

  // Not signed in (login page) → no chrome.
  if (!me) return <>{children}</>;

  const manager = isManager(me);
  const admin = isAdmin(me);
  const marketing = canAccessMarketing(me);
  const [newTickets, newSuggestions] = await Promise.all([
    manager ? db.ticket.count({ where: { status: "new" } }) : Promise.resolve(0),
    admin ? db.suggestion.count({ where: { status: "proposed" } }) : Promise.resolve(0),
  ]);

  // Start-of-shift nag: if this rep tracks internet and hasn't run today's speed
  // test, show a persistent banner until they do (they open the app at shift start).
  let needsSpeedTest = false;
  if (me.tracksInternet) {
    const settings = await getSettings();
    const today = todayStr(settings.orgTimezone);
    const speedKpi = await db.kpi.findFirst({ where: { roleKey: "internet" }, select: { id: true } });
    if (speedKpi) {
      const logged = await db.entry.findFirst({
        where: { kpiId: speedKpi.id, userId: me.id, date: today },
        select: { id: true },
      });
      needsSpeedTest = !logged;
    }
  }

  return (
    <div className="md:flex md:min-h-screen">
      <Sidebar name={me.name} manager={manager} admin={admin} marketing={marketing} newTickets={newTickets} newSuggestions={newSuggestions} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1320px] px-4 py-6 md:px-8 md:py-8">
          {needsSpeedTest && (
            <Link
              href="/entry"
              className="mb-5 flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-300 transition hover:bg-amber-100"
            >
              <span className="text-xl">📡</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-amber-900">Run your internet speed test for today</div>
                <div className="text-xs text-amber-700">Quick start-of-shift check — it records to your KPIs automatically. Goal 50+ Mbps.</div>
              </div>
              <span className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">Run it →</span>
            </Link>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
