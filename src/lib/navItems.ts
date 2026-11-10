// Canonical nav list — the source of truth for the sidebar AND the Access-preview
// editor, so what you toggle there is exactly what shows in a person's menu.
export type NavGate = "all" | "manager" | "admin" | "marketing" | "csuite" | "training";
export type NavItem = { href: string; label: string; gate: NavGate };
export type NavGroup = { group: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  // Department columns (Jon 2026-10-06) — every tab is draggable between
  // groups in Admin → System → Sidebar order, so this is just the default.
  { group: "Team Overview", items: [
    { href: "/dashboard", label: "Dashboard", gate: "all" },
    { href: "/process", label: "Process Map", gate: "all" },
    { href: "/schedule", label: "Schedule & Time", gate: "all" },
    { href: "/rewards", label: "Rewards", gate: "all" },
    { href: "/certificates", label: "Certificates", gate: "manager" },
  ] },
  { group: "Acquisitions", items: [
    { href: "/crm", label: "Seller CRM", gate: "all" },
    { href: "/crm/conversations", label: "Conversations", gate: "all" },
    { href: "/crm/tasks?dept=acquisitions", label: "Tasks", gate: "all" },
    { href: "/crm/contacts?dept=acq", label: "Contacts", gate: "all" },
    { href: "/crm/calendar?dept=acq", label: "Calendar", gate: "all" },
    { href: "/underwriting", label: "Underwriting", gate: "all" },
    { href: "/reduction", label: "Reduction Play", gate: "all" },
    { href: "/sop/acquisitions", label: "Acquisitions SOP", gate: "all" },
    { href: "/sequences", label: "Follow-up Automation", gate: "manager" },
  ] },
  { group: "Dispositions", items: [
    { href: "/dispo", label: "Dispo CRM", gate: "marketing" },
    { href: "/crm/conversations?dept=dispo", label: "Dispo Conversations", gate: "marketing" },
    { href: "/crm/tasks?dept=dispositions", label: "Dispo Tasks", gate: "marketing" },
    { href: "/crm/contacts?dept=dispo", label: "Dispo Contacts", gate: "marketing" },
    { href: "/crm/calendar?dept=dispo", label: "Dispo Calendar", gate: "marketing" },
    { href: "/sop/dispo", label: "Dispo SOP", gate: "marketing" },
    { href: "/deals", label: "Deals", gate: "all" },
    { href: "/crm/dealboard", label: "Deal Board", gate: "all" },
    { href: "/marketing", label: "Vetted Buyers", gate: "marketing" },
    { href: "/closing-calc", label: "Closing Calculator", gate: "manager" },
  ] },
  { group: "Marketing", items: [
    { href: "/markets", label: "Target Markets", gate: "marketing" },
    { href: "/lead-sourcing", label: "Lead Sourcing", gate: "marketing" },
  ] },
  { group: "Business Heartbeat", items: [
    { href: "/comms-health", label: "Comms Guardian", gate: "manager" },
    { href: "/compliance", label: "Compliance", gate: "all" },
    { href: "/phone-health", label: "Phone Health", gate: "all" },
    { href: "/email-health", label: "Email Health", gate: "manager" },
  ] },
  { group: "Performance", items: [
    { href: "/entry", label: "Enter KPIs", gate: "all" },
    { href: "/report", label: "KPI Reports", gate: "all" },
    { href: "/kpi-audit", label: "KPI Verification", gate: "csuite" },
    { href: "/kpi-flags", label: "KPI Flags", gate: "manager" },
    { href: "/analytics", label: "Analytics", gate: "manager" },
    { href: "/lead-roi", label: "Lead ROI", gate: "all" },
  ] },
  { group: "Coaching", items: [
    { href: "/whats-new", label: "What's New", gate: "all" },
    { href: "/training", label: "Training Portal", gate: "training" },
    { href: "/tutorials", label: "Loom Tutorials", gate: "all" },
    { href: "/ai-training", label: "AI Training", gate: "all" },
    { href: "/onboarding", label: "Onboarding", gate: "manager" },
    { href: "/alerts", label: "Alerts", gate: "manager" },
    { href: "/pip", label: "PIPs", gate: "manager" },
    { href: "/call-scoring", label: "Call scoring", gate: "all" },
    { href: "/scripts", label: "Scripts", gate: "all" },
    { href: "/glossary", label: "Glossary", gate: "all" },
    { href: "/playbooks", label: "Playbooks", gate: "all" },
  ] },
  { group: "EOS", items: [
    { href: "/meeting", label: "Monday Meeting", gate: "manager" },
    { href: "/stoplight", label: "Stoplight Check", gate: "all" },
    { href: "/leadership", label: "Leadership Meeting", gate: "manager" },
    { href: "/rocks", label: "Rocks", gate: "all" },
    { href: "/issues", label: "Issues", gate: "admin" },
    { href: "/vto", label: "Vision (V/TO)", gate: "all" },
    { href: "/team-360", label: "Team 360", gate: "all" },
  ] },
  { group: "C-Suite", items: [
    { href: "/expenses", label: "Profit & Loss Report", gate: "csuite" },
    { href: "/timecard", label: "Payroll", gate: "csuite" },
    { href: "/team-roster", label: "Team Roster", gate: "csuite" },
    { href: "/land-master", label: "Land Master Plan", gate: "csuite" },
  ] },
  { group: "Requests & Support", items: [
    { href: "/blueprint", label: "War Room Guide", gate: "all" },
    { href: "/tickets", label: "Requests", gate: "all" },
    { href: "/software", label: "Software & Logins", gate: "all" },
    { href: "/ai-champion", label: "AI Champion", gate: "all" },
  ] },
  { group: "Settings", items: [
    { href: "/account", label: "My Account & Signature", gate: "all" },
    { href: "/ai-updates", label: "AI updates", gate: "admin" },
    { href: "/admin", label: "Settings Hub", gate: "csuite" },
  ] },
];

// Default template for a BRAND-NEW rep (Jon's checklist, 2026-08-26): they start
// with ONLY these sections visible; the owner widens access per person in
// Admin → Access preview as they ramp. Every other "all"-gated section begins
// hidden. (Manager/marketing/C-Suite gates already exclude new reps by role,
// and C-Suite/pay data is hard-locked to Jon/Enrico/Viktoriia by name.)
export const NEW_REP_ALLOWED = new Set<string>([
  "/process", "/underwriting", "/schedule", "/rewards",   // Overview (Culture folded into /schedule)
  "/entry", "/report",                                                 // Performance
  "/ai-training", "/call-scoring", "/scripts", "/glossary", "/tutorials", // Coaching
  "/rocks", "/vto", "/team-360", "/stoplight",                         // EOS
  "/blueprint", "/tickets", "/ai-champion",                                       // Requests & Support (no Software & Logins by default — Jon 2026-08-26)
]);

/** navHidden JSON for a freshly created rep — everything not in the template. */
export function defaultNewRepNavHidden(): string {
  const hidden = NAV_GROUPS.flatMap((g) => g.items.filter((i) => i.gate === "all" && !NEW_REP_ALLOWED.has(i.href)).map((i) => i.href));
  return JSON.stringify(hidden);
}

/** Parse the per-user hidden-href list (JSON array stored on User.navHidden). */
export function parseNavHidden(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}

/** Is this path explicitly hidden for the user (exact or sub-path)? */
export function isPathHidden(path: string, hidden: string[]): boolean {
  return hidden.some((h) => path === h || path.startsWith(h + "/"));
}
