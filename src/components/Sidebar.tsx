"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Building2, SquarePen, FileText, CalendarDays, BarChart3,
  Bell, ShieldAlert, Headphones, Ticket, Sparkles, Settings, Tv, LogOut, Menu, X, TrendingUp, Briefcase, Presentation, Crown, Lightbulb, Bot, ScrollText, Users, Lock, Mountain, Flag, Compass, KeyRound, Megaphone, Map, Gauge, CalendarClock, Calculator, Workflow, Wallet, Target, Gift, GraduationCap, Receipt, Activity, Search, PartyPopper, BookOpen, UserPlus, Phone, ShieldCheck,
} from "lucide-react";
import { signOut } from "@/app/actions";
import Logo from "./Logo";
import StatusDot from "./StatusDot";

type Item = { href: string; label: string; Icon: typeof Bell; managerOnly?: boolean; adminOnly?: boolean; marketingOnly?: boolean; timecardOnly?: boolean; csuiteOnly?: boolean; trainingOnly?: boolean; badge?: number };

// Extra search terms per page so a search matches what people actually call things
// (e.g. "payroll" finds Schedule & Time, "P&L" finds the Profit & Loss report).
const SEARCH_KEYWORDS: Record<string, string> = {
  "/underwriting": "calculator offer mao comps deal analyzer novation assignment developer land cash double close",
  "/marketing": "vetted buyers buy box developers cash buyers jv partners map",
  "/lead-sourcing": "leads pull markets areas where to pull sourcing farm demand",
  "/vetting": "buyer research vet developers unvetted",
  "/schedule": "time card timecard punch clock breaks lunch bathroom pto time off availability hours",
  "/timecard": "payroll pay hours wages",
  "/expenses": "profit loss p&l pnl accounting costs revenue expenses",
  "/closing": "escrow closing hud profit expenses",
  "/scripts": "objections rebuttals seller luxury talk tracks",
  "/playbooks": "sop process novation double close outreach",
  "/land-master": "land master plan infill recreational luxury john hunter lux tyson courses playbook goldmine mao",
  "/glossary": "definitions terms meaning",
  "/team-360": "peer review superpowers strengths growth feedback",
  "/report": "kpi history reports past dates calendar",
  "/entry": "enter kpis log numbers bulk lead import",
  "/deals": "pipeline dispositions",
  "/huddle": "standup morning brief",
  "/call-scoring": "call recording transcript coaching score",
  "/phone-health": "phone health answer rate spam likely scam twilio telnyx carrier caller id registration flagged dialer numbers list pull skip trace sms sop directrei regrid skipmatrix scrub dnc litigator suppression texting campaign",
  "/compliance": "compliance a2p 10dlc sms tcpa cold call dnc do not call telemarketing direct mail can-spam email consent state laws twilio telnyx recording two party legal",
  "/cfd-notes": "cfd contract for deed owner finance notes ledger seller financing payments default land",
  "/ai-training": "ai training claude chatgpt gemini perplexity prompt prompting models haiku sonnet opus fable effort artificial intelligence learn",
  "/software": "logins passwords tools vendors",
  "/tickets": "requests help support",
  "/leaks": "war room health issues",
  "/rocks": "eos quarterly goals",
  "/vto": "vision traction organizer eos",
};

export default function Sidebar({
  name, manager, admin, owner, marketing, timecard, csuite, training, allowedPaths, hiddenNav, newTickets, newSuggestions,
}: {
  name: string;
  manager: boolean;
  admin: boolean;
  owner: boolean;
  marketing: boolean;
  timecard: boolean;
  csuite: boolean;
  training: boolean;
  allowedPaths?: string[] | null;
  hiddenNav?: string[];
  newTickets: number;
  newSuggestions: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const groups: { label: string; items: Item[] }[] = [
    { label: "Overview", items: [
      { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
      { href: "/huddle", label: "Daily Huddle", Icon: Megaphone },
      { href: "/deals", label: "Deals", Icon: Building2 },
      { href: "/process", label: "Process Map", Icon: Workflow },
      { href: "/underwriting", label: "Underwriting", Icon: Calculator },
      { href: "/cfd-notes", label: "CFD Notes", Icon: ScrollText, managerOnly: true },
      { href: "/schedule", label: "Schedule & Time", Icon: CalendarClock },
      { href: "/marketing", label: "Vetted Buyers", Icon: Megaphone, marketingOnly: true },
      { href: "/vetting", label: "Buyer Research", Icon: Search, marketingOnly: true },
      { href: "/rewards", label: "Rewards", Icon: Gift },
      { href: "/culture", label: "Culture", Icon: PartyPopper },
    ] },
    { label: "Business Heartbeat", items: [
      { href: "/compliance", label: "Compliance", Icon: ShieldCheck },
      { href: "/phone-health", label: "Phone Health", Icon: Phone },
    ] },
    { label: "Performance", items: [
      { href: "/entry", label: "Enter KPIs", Icon: SquarePen },
      { href: "/report", label: "KPI Reports", Icon: FileText },
      { href: "/kpi-sources", label: "KPI Sources", Icon: ScrollText },
      { href: "/analytics", label: "Analytics", Icon: BarChart3, managerOnly: true },
      { href: "/internet", label: "Internet Speed", Icon: Gauge, managerOnly: true },
    ] },
    { label: "Coaching", items: [
      { href: "/training", label: "Training Portal", Icon: GraduationCap, trainingOnly: true },
      { href: "/ai-training", label: "AI Training", Icon: Bot },
      { href: "/onboarding", label: "Onboarding", Icon: UserPlus, managerOnly: true },
      { href: "/alerts", label: "Alerts", Icon: Bell, managerOnly: true },
      { href: "/pip", label: "PIPs", Icon: ShieldAlert, managerOnly: true },
      { href: "/call-scoring", label: "Call scoring", Icon: Headphones },
      { href: "/scripts", label: "Scripts", Icon: ScrollText },
      { href: "/glossary", label: "Glossary", Icon: BookOpen },
      { href: "/playbooks", label: "Playbooks", Icon: Lightbulb },
      { href: "/land-master", label: "Land Master Plan", Icon: Map },
    ] },
    { label: "EOS", items: [
      { href: "/meeting", label: "Monday Meeting", Icon: Presentation, managerOnly: true },
      { href: "/leadership", label: "Leadership Meeting", Icon: Crown, managerOnly: true },
      { href: "/rocks", label: "Rocks", Icon: Mountain },
      { href: "/issues", label: "Issues", Icon: Flag, adminOnly: true },
      { href: "/vto", label: "Vision (V/TO)", Icon: Compass },
      { href: "/team-360", label: "Team 360", Icon: Sparkles },
    ] },
    { label: "C-Suite", items: [
      { href: "/leaks", label: "War Room Health", Icon: Activity, csuiteOnly: true },
      { href: "/expenses", label: "Profit & Loss Report", Icon: Receipt, csuiteOnly: true },
      { href: "/timecard", label: "Payroll", Icon: Wallet, csuiteOnly: true },
      { href: "/roadmap", label: "Roadmap", Icon: Map, csuiteOnly: true },
      { href: "/team-roster", label: "Team Roster", Icon: Users, csuiteOnly: true },
    ] },
    { label: "Requests & Support", items: [
      { href: "/tickets", label: "Requests", Icon: Ticket, badge: newTickets },
      { href: "/software", label: "Software & Logins", Icon: KeyRound },
      { href: "/ai-champion", label: "AI Champion", Icon: Bot },
      { href: "/ai-updates", label: "AI updates", Icon: Sparkles, adminOnly: true, badge: newSuggestions },
      { href: "/admin", label: "Admin", Icon: Settings, managerOnly: true },
    ] },
  ];

  const hidden = hiddenNav ?? [];
  const visible = (it: Item) =>
    (!it.managerOnly || manager) && (!it.adminOnly || admin) && (!it.marketingOnly || marketing) && (!it.timecardOnly || timecard) && (!it.csuiteOnly || csuite) && (!it.trainingOnly || training) &&
    !hidden.some((h) => it.href === h || it.href.startsWith(h + "/")) &&
    (!allowedPaths || allowedPaths.some((p) => it.href === p || it.href.startsWith(p + "/")));
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // Flat, searchable index of every page the user can actually see (+ the wall display).
  const allItems: (Item & { group: string })[] = [
    ...groups.flatMap((g) => g.items.filter(visible).map((it) => ({ ...it, group: g.label }))),
    { href: "/tv", label: "Wall display", Icon: Tv, group: "Display" },
  ];
  const q = query.trim().toLowerCase();
  const results = q
    ? allItems.filter((it) => `${it.label} ${it.group} ${SEARCH_KEYWORDS[it.href] ?? ""}`.toLowerCase().includes(q))
    : [];
  const goResult = () => { if (results[0]) { router.push(results[0].href); setQuery(""); setOpen(false); } };

  const Nav = (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5 pb-3">
        <a href="https://freedom-offers.com" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="block" title="Visit freedom-offers.com">
          <Logo size="sm" tagline />
        </a>
        {owner && <div className="mt-2"><StatusDot /></div>}
      </div>

      {/* Search — jump to any page by name or by what people call it ("payroll", "leads", "P&L") */}
      <div className="px-3 pb-2">
        <form onSubmit={(e) => { e.preventDefault(); goResult(); }} className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-navy-300" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the war room…"
            aria-label="Search the war room"
            className="w-full rounded-lg bg-white/5 py-2 pl-8 pr-7 text-sm text-white placeholder:text-brand-navy-300 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-navy-300 hover:text-white">
              <X size={14} />
            </button>
          )}
        </form>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {q ? (
          results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-brand-navy-300">No pages match &ldquo;{query}&rdquo;.</div>
          ) : (
            <div className="space-y-0.5">
              {results.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => { setQuery(""); setOpen(false); }}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-brand-navy-100 transition hover:bg-white/5 hover:text-white"
                >
                  <it.Icon size={18} strokeWidth={1.75} className="text-brand-navy-300 group-hover:text-white" />
                  <span className="flex-1">{it.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-brand-navy-300">{it.group}</span>
                </Link>
              ))}
            </div>
          )
        ) : (
        <>
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
        </>
        )}

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
        <a href="https://freedom-offers.com" target="_blank" rel="noopener noreferrer" title="Visit freedom-offers.com"><Logo size="sm" /></a>
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
