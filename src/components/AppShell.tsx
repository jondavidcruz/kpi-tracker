// Authenticated app shell: left sidebar + content. Also enforces the lockout
// (removed/deactivated accounts are signed out). Login and the public wall
// display render without chrome.
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionEmail, getCurrentUser, isManager, isAdmin, isOwner, canAccessMarketing, canAccessPayroll, canAccessCSuite, navAllowlist, isPathAllowed } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import Sidebar from "./Sidebar";
import ContentWrap from "./ContentWrap";
import ThemeToggle from "./ThemeToggle";
import { parseNavHidden, isPathHidden } from "@/lib/navItems";
import ClientWidgets from "./ClientWidgets";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const email = await getSessionEmail();
  const me = email ? await getCurrentUser() : null;

  // Removed/deactivated account with a lingering session → sign out.
  if (email && (!me || !me.active)) redirect("/auth/signout");

  const reqPath = (await headers()).get("x-pathname") ?? "/";
  // The candidate assessment is a standalone, no-login experience — never wrap it in
  // the War Room shell, even for a signed-in owner. Candidates (who aren't in the
  // business) see ONLY the assessment, none of our sections.
  if (reqPath.startsWith("/assess")) return <>{children}</>;

  // Not signed in (login page) → no chrome.
  if (!me) return <>{children}</>;

  // Restricted users (e.g. Ethan — listings only) can only reach their allowed
  // pages; bounce them to their home page if they land anywhere else.
  const allow = navAllowlist(me);
  const hiddenNav = parseNavHidden(me.navHidden);
  if (allow && !isPathAllowed(reqPath, allow)) redirect(allow[0]);
  // Per-user hidden sections are blocked by URL too — not just removed from the menu.
  if (isPathHidden(reqPath, hiddenNav)) redirect("/dashboard");

  const manager = isManager(me);
  const admin = isAdmin(me);
  const marketing = canAccessMarketing(me);
  const payroll = canAccessPayroll(me);
  const timecard = payroll; // Payroll is leadership-only (Jon, Viktoriia, Enrico)
  const csuite = canAccessCSuite(me); // C-Suite group — Jon, Enrico, Viktoriia only
  const trainFirst = me.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const training = manager || ["michelle", "marie", "sharyn"].includes(trainFirst); // can view the Training Portal
  const [newTickets, newSuggestions, openOffboarding] = await Promise.all([
    manager ? db.ticket.count({ where: { status: "new" } }) : Promise.resolve(0),
    admin ? db.suggestion.count({ where: { status: "proposed" } }) : Promise.resolve(0),
    manager ? db.offboarding.findFirst({ where: { completedAt: null }, include: { _count: { select: { tasks: { where: { done: false } } } } } }) : Promise.resolve(null),
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
      <ThemeToggle />
      <Sidebar name={me.name} manager={manager} admin={admin} owner={isOwner(me)} marketing={marketing} timecard={timecard} csuite={csuite} training={training} allowedPaths={allow} hiddenNav={hiddenNav} newTickets={newTickets} newSuggestions={newSuggestions} />
      <main className="min-w-0 flex-1">
        <ContentWrap>
          {openOffboarding && (
            <Link href="/admin#offboarding" className="mb-5 flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 ring-1 ring-red-300 transition hover:bg-red-100">
              <span className="text-xl">🚪</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-red-800">Offboarding {openOffboarding.name} — {openOffboarding._count.tasks} task{openOffboarding._count.tasks === 1 ? "" : "s"} left</div>
                <div className="text-xs text-red-600">Remove shared access &amp; change shared passwords before this person is fully gone.</div>
              </div>
              <span className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">Finish it →</span>
            </Link>
          )}
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
        </ContentWrap>
      </main>
      {/* Non-critical client widgets (Cortana, team availability, heartbeat) — lazy-loaded
          after first paint. Everyone sees the availability window. */}
      <ClientWidgets showPresence />
    </div>
  );
}
