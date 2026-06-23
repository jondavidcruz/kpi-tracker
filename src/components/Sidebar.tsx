"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, SquarePen, FileText, CalendarDays, BarChart3,
  Bell, ShieldAlert, Headphones, Ticket, Sparkles, Settings, Tv, LogOut, Menu, X, TrendingUp, Briefcase, DollarSign, Presentation, Crown, Lightbulb, Bot, ScrollText, Users, Lock, Mountain, Flag, Compass, KeyRound, Megaphone, Map, Gauge, CalendarClock, Calculator, Workflow, Wallet, Target, Gift, GraduationCap, Receipt, Activity, Search,
} from "lucide-react";
import { signOut } from "@/app/actions";
import Logo from "./Logo";

type Item = { href: string; label: string; Icon: typeof Bell; managerOnly?: boolean; adminOnly?: boolean; marketingOnly?: boolean; timecardOnly?: boolean; trainingOnly?: boolean; badge?: number };

export default function Sidebar({
  name, manager, admin, marketing, timecard, training, allowedPaths, newTickets, newSuggestions,
}: {
  name: string;
  manager: boolean;
  admin: boolean;
  marketing: boolean;
  timecard: boolean;
  training: boolean;
  allowedPaths?: string[] | null;
  newTickets: number;
  newSuggestions: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups: { label: string; items: Item[] }[] = [
    { label: "Overview", items: [
      { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
      { href: "/huddle", label: "Daily Huddle", Icon: Megaphone },
      { href: "/deals", label: "Deals", Icon: Building2 },
      { href: "/process", label: "Process Map", Icon: Workflow },
      { href: "/underwriting", label: "Underwriting", Icon: Calculator },
      { href: "/schedule", label: "Schedule & Time", Icon: CalendarClock },
      { href: "/marketing", label: "Markets / Vetted Buyers", Icon: Megaphone, marketingOnly: true },
      { href: "/vetting", label: "Buyer Research", Icon: Search, marketingOnly: true },
      { href: "/rewards", label: "Rewards", Icon: Gift },
    ] },
    { label: "Performance", items: [
      { href: "/entry", label: "Enter KPIs", Icon: SquarePen },
      { href: "/report", label: "KPI Reports", Icon: FileText },
      { href: "/analytics", label: "Analytics", Icon: BarChart3, managerOnly: true },
      { href: "/internet", label: "Internet Speed", Icon: Gauge, managerOnly: true },
    ] },
    { label: "Coaching", items: [
      { href: "/training", label: "Training Portal", Icon: GraduationCap, trainingOnly: true },
      { href: "/alerts", label: "Alerts", Icon: Bell, managerOnly: true },
      { href: "/pip", label: "PIPs", Icon: ShieldAlert, managerOnly: true },
      { href: "/call-scoring", label: "Call scoring", Icon: Headphones },
      { href: "/scripts", label: "Scripts", Icon: ScrollText },
    ] },
    { label: "EOS", items: [
      { href: "/meeting", label: "Monday Meeting", Icon: Presentation, managerOnly: true },
      { href: "/leadership", label: "Leadership Meeting", Icon: Crown, managerOnly: true },
      { href: "/rocks", label: "Rocks", Icon: Mountain },
      { href: "/issues", label: "Issues", Icon: Flag, adminOnly: true },
      { href: "/vto", label: "Vision (V/TO)", Icon: Compass },
    ] },
    { label: "C-Suite", items: [
      { href: "/leaks", label: "War Room Health", Icon: Activity, timecardOnly: true },
      { href: "/expenses", label: "Profit & Loss Report", Icon: Receipt, timecardOnly: true },
      { href: "/timecard", label: "Payroll", Icon: Wallet, timecardOnly: true },
      { href: "/roadmap", label: "Roadmap", Icon: Map, adminOnly: true },
      { href: "/team-roster", label: "Team Roster", Icon: Users, adminOnly: true },
    ] },
    { label: "Requests & Support", items: [
      { href: "/tickets", label: "Requests", Icon: Ticket, badge: newTickets },
      { href: "/software", label: "Software & Logins", Icon: KeyRound },
      { href: "/ai-champion", label: "AI Champion", Icon: Bot },
      { href: "/ai-updates", label: "AI updates", Icon: Sparkles, adminOnly: true, badge: newSuggestions },
      { href: "/admin", label: "Admin", Icon: Settings, managerOnly: true },
    ] },
  ];

  const visible = (it: Item) =>
    (!it.managerOnly || manager) && (!it.adminOnly || admin) && (!it.marketingOnly || marketing) && (!it.timecardOnly || timecard) && (!it.trainingOnly || training) &&
    (!allowedPaths || allowedPaths.some((p) => it.href === p || it.href.startsWith(p + "/")));
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const Nav = (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" onClick={() => setOpen(false)} className="block px-4 py-5">
        <Logo size="sm" tagline />
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
                      {it.adminOnly ? (
                        <span title="Owner only — just you"><Lock size={11} className="shrink-0 text-brand-gold-soft/90" /></span>
                      ) : it.managerOnly ? (
                        <span title="You + Marie (managers)"><Lock size={11} className="shrink-0 text-sky-300/90" /></span>
                      ) : null}
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

        {/* Lock-color key (visible only where locked items appear) */}
        {(manager || admin) && (
          <div className="mt-2 flex flex-col gap-1 px-3 pt-2 text-[10px] text-brand-navy-300">
            {admin && <span className="flex items-center gap-1.5"><Lock size={10} className="text-brand-gold-soft/90" /> Owner only — just you</span>}
            <span className="flex items-center gap-1.5"><Lock size={10} className="text-sky-300/90" /> You + Marie</span>
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <Link href="/account" onClick={() => setOpen(false)} title="My account & password" className="grid h-8 w-8 place-items-center rounded-full bg-brand-navy-2 text-xs font-semibold text-brand-gold-soft hover:ring-2 hover:ring-brand-gold/40">{initials(name)}</Link>
          <Link href="/account" onClick={() => setOpen(false)} className="flex-1 truncate text-sm text-brand-navy-100 hover:text-white">{name}</Link>
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
        <Link href="/dashboard"><Logo size="sm" /></Link>
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
