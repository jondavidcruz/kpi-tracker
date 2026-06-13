"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, SquarePen, FileText, CalendarDays, BarChart3,
  Bell, ShieldAlert, Headphones, Ticket, Sparkles, Settings, Tv, LogOut, Menu, X,
} from "lucide-react";
import { signOut } from "@/app/actions";

type Item = { href: string; label: string; Icon: typeof Bell; managerOnly?: boolean; adminOnly?: boolean; badge?: number };

export default function Sidebar({
  name, manager, admin, newTickets, newSuggestions,
}: {
  name: string;
  manager: boolean;
  admin: boolean;
  newTickets: number;
  newSuggestions: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups: { label: string; items: Item[] }[] = [
    { label: "Overview", items: [
      { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
      { href: "/deals", label: "Deals", Icon: Building2 },
    ] },
    { label: "Performance", items: [
      { href: "/entry", label: "Enter KPIs", Icon: SquarePen },
      { href: "/report", label: "Weekly report", Icon: FileText },
      { href: "/monthly", label: "Monthly report", Icon: CalendarDays },
      { href: "/analytics", label: "Analytics", Icon: BarChart3, managerOnly: true },
    ] },
    { label: "Coaching", items: [
      { href: "/alerts", label: "Alerts", Icon: Bell },
      { href: "/pip", label: "PIPs", Icon: ShieldAlert, managerOnly: true },
      { href: "/call-scoring", label: "Call scoring", Icon: Headphones },
    ] },
    { label: "Workspace", items: [
      { href: "/tickets", label: "Tickets", Icon: Ticket, badge: newTickets },
      { href: "/ai-updates", label: "AI updates", Icon: Sparkles, adminOnly: true, badge: newSuggestions },
      { href: "/admin", label: "Admin", Icon: Settings, managerOnly: true },
    ] },
  ];

  const visible = (it: Item) => (!it.managerOnly || manager) && (!it.adminOnly || admin);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const Nav = (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-4">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-gold text-base font-bold text-brand-navy">FO</span>
        <span className="text-[15px] font-semibold text-white">Freedom Offers</span>
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((g) => {
          const items = g.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={g.label}>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-navy-300">{g.label}</div>
              <div className="space-y-0.5">
                {items.map((it) => {
                  const active = isActive(it.href);
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                        active
                          ? "bg-brand-navy-700 font-semibold text-white"
                          : "text-brand-navy-100 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <it.Icon size={18} strokeWidth={1.75} className={active ? "text-brand-gold" : "text-brand-navy-300 group-hover:text-white"} />
                      <span className="flex-1">{it.label}</span>
                      {it.badge ? (
                        <span className="rounded-full bg-brand-gold px-1.5 py-0.5 text-[10px] font-bold text-brand-navy">{it.badge}</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div>
          <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-navy-300">Display</div>
          <Link href="/tv" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-navy-100 hover:bg-white/5 hover:text-white">
            <Tv size={18} strokeWidth={1.75} className="text-brand-navy-300" />
            Wall display
          </Link>
        </div>
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-navy-2 text-xs font-semibold text-brand-gold-soft">{initials(name)}</span>
          <span className="flex-1 truncate text-sm text-brand-navy-100">{name}</span>
          <form action={signOut}>
            <button aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-lg text-brand-navy-300 hover:bg-white/5 hover:text-white">
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between bg-brand-navy px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-gold text-sm font-bold text-brand-navy">FO</span>
          <span className="text-sm font-semibold text-white">Freedom Offers</span>
        </Link>
        <button aria-label="Open menu" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-white hover:bg-white/10">
          <Menu size={22} />
        </button>
      </div>

      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 bg-brand-navy md:block">{Nav}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-brand-navy-950/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-brand-navy">
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-2 top-3 grid h-9 w-9 place-items-center rounded-lg text-brand-navy-300 hover:bg-white/5 hover:text-white">
              <X size={20} />
            </button>
            {Nav}
          </div>
        </div>
      )}
    </>
  );
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
