// Top navigation. Server component — knows who's signed in and their role.
import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { signOut } from "@/app/actions";

const BASE_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/entry", label: "Enter KPIs" },
  { href: "/deals", label: "Deals" },
  { href: "/monthly", label: "Monthly" },
  { href: "/report", label: "Weekly Report" },
  { href: "/alerts", label: "Alerts" },
];

export default async function NavBar() {
  const me = await getCurrentUser();

  return (
    <header className="sticky top-0 z-10 border-b border-brand-navy/15 bg-brand-navy text-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link
          href={me ? "/dashboard" : "/login"}
          className="mr-5 flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-gold text-brand-navy">
            FO
          </span>
          <span>
            Freedom Offers <span className="font-normal text-white/60">· KPIs</span>
          </span>
        </Link>

        {me && (
          <>
            <nav className="flex items-center gap-1 overflow-x-auto">
              {BASE_NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
              {isManager(me) && (
                <>
                  <Link
                    href="/analytics"
                    className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    Analytics
                  </Link>
                  <Link
                    href="/admin"
                    className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    Admin
                  </Link>
                </>
              )}
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
