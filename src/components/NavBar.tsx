// Top navigation. Server component — knows who's signed in and their role.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionEmail, getCurrentUser, isManager } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { db } from "@/lib/db";

// Ordered once; managerOnly items are hidden from reps but keep their place.
const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/deals", label: "Deals" },
  { href: "/entry", label: "Enter KPIs" },
  { href: "/report", label: "Weekly Report" },
  { href: "/monthly", label: "Monthly Report" },
  { href: "/analytics", label: "Analytics", managerOnly: true },
  { href: "/alerts", label: "Alerts" },
  { href: "/pip", label: "PIPs", managerOnly: true },
  { href: "/tickets", label: "Tickets" },
  { href: "/admin", label: "Admin", managerOnly: true },
];

export default async function NavBar() {
  const email = await getSessionEmail();
  const me = email ? await getCurrentUser() : null;

  // Lockout: a signed-in person whose account was removed or deactivated is
  // signed out and bounced to login. This is what makes "remove from team"
  // actually block access, not just hide their scorecard.
  if (email && (!me || !me.active)) {
    redirect("/auth/signout");
  }

  const manager = isManager(me);
  const newTickets = manager ? await db.ticket.count({ where: { status: "new" } }) : 0;
  const items = NAV.filter((n) => !n.managerOnly || manager);

  return (
    <header className="sticky top-0 z-10 border-b border-brand-navy/15 bg-brand-navy text-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link
          href={me ? "/dashboard" : "/login"}
          className="mr-5 flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-gold text-brand-navy">FO</span>
          <span>Freedom Offers <span className="font-normal text-white/60">· KPIs</span></span>
        </Link>

        {me && (
          <>
            <nav className="flex items-center gap-1 overflow-x-auto">
              {items.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  {n.label}
                  {n.href === "/tickets" && newTickets > 0 && (
                    <span className="ml-1.5 rounded-full bg-brand-gold px-1.5 py-0.5 text-[10px] font-bold text-brand-navy">{newTickets}</span>
                  )}
                </Link>
              ))}
              <Link
                href="/tv"
                className="ml-1 whitespace-nowrap rounded-lg bg-brand-gold/90 px-3 py-1.5 text-sm font-semibold text-brand-navy transition hover:bg-brand-gold"
              >
                📺 Wall Display
              </Link>
            </nav>

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-sm text-white/60 sm:inline">{me.name}</span>
              <form action={signOut}>
                <button className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white">
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
