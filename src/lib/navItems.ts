// Canonical nav list — the source of truth for the sidebar AND the Access-preview
// editor, so what you toggle there is exactly what shows in a person's menu.
export type NavGate = "all" | "manager" | "admin" | "marketing" | "csuite" | "training";
export type NavItem = { href: string; label: string; gate: NavGate };
export type NavGroup = { group: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { group: "Overview", items: [
    { href: "/dashboard", label: "Dashboard", gate: "all" },
    { href: "/huddle", label: "Daily Huddle", gate: "all" },
    { href: "/deals", label: "Deals", gate: "all" },
    { href: "/process", label: "Process Map", gate: "all" },
    { href: "/underwriting", label: "Underwriting", gate: "all" },
    { href: "/schedule", label: "Schedule & Time", gate: "all" },
    { href: "/cfd-notes", label: "CFD Notes", gate: "manager" },
    { href: "/marketing", label: "Vetted Buyers", gate: "marketing" },
    { href: "/lead-sourcing", label: "Lead Sourcing", gate: "marketing" },
    { href: "/vetting", label: "Buyer Research", gate: "marketing" },
    { href: "/rewards", label: "Rewards", gate: "all" },
    { href: "/culture", label: "Culture", gate: "all" },
  ] },
  { group: "Business Heartbeat", items: [
    { href: "/compliance", label: "Compliance", gate: "all" },
    { href: "/phone-health", label: "Phone Health", gate: "all" },
  ] },
  { group: "Performance", items: [
    { href: "/entry", label: "Enter KPIs", gate: "all" },
    { href: "/report", label: "KPI Reports", gate: "all" },
    { href: "/kpi-sources", label: "KPI Sources", gate: "all" },
    { href: "/analytics", label: "Analytics", gate: "manager" },
    { href: "/lead-roi", label: "Lead ROI", gate: "all" },
    { href: "/internet", label: "Internet Speed", gate: "manager" },
  ] },
  { group: "Coaching", items: [
    { href: "/training", label: "Training Portal", gate: "training" },
    { href: "/ai-training", label: "AI Training", gate: "all" },
    { href: "/onboarding", label: "Onboarding", gate: "manager" },
    { href: "/alerts", label: "Alerts", gate: "manager" },
    { href: "/pip", label: "PIPs", gate: "manager" },
    { href: "/call-scoring", label: "Call scoring", gate: "all" },
    { href: "/scripts", label: "Scripts", gate: "all" },
    { href: "/glossary", label: "Glossary", gate: "all" },
    { href: "/playbooks", label: "Playbooks", gate: "all" },
    { href: "/land-master", label: "Land Master Plan", gate: "all" },
  ] },
  { group: "EOS", items: [
    { href: "/meeting", label: "Monday Meeting", gate: "manager" },
    { href: "/leadership", label: "Leadership Meeting", gate: "manager" },
    { href: "/rocks", label: "Rocks", gate: "all" },
    { href: "/issues", label: "Issues", gate: "admin" },
    { href: "/vto", label: "Vision (V/TO)", gate: "all" },
    { href: "/team-360", label: "Team 360", gate: "all" },
  ] },
  { group: "C-Suite", items: [
    { href: "/leaks", label: "War Room Health", gate: "csuite" },
    { href: "/expenses", label: "Profit & Loss Report", gate: "csuite" },
    { href: "/timecard", label: "Payroll", gate: "csuite" },
    { href: "/roadmap", label: "Roadmap", gate: "csuite" },
    { href: "/team-roster", label: "Team Roster", gate: "csuite" },
  ] },
  { group: "Requests & Support", items: [
    { href: "/tickets", label: "Requests", gate: "all" },
    { href: "/software", label: "Software & Logins", gate: "all" },
    { href: "/ai-champion", label: "AI Champion", gate: "all" },
    { href: "/ai-updates", label: "AI updates", gate: "admin" },
    { href: "/admin", label: "Admin", gate: "manager" },
  ] },
];

// Default template for a BRAND-NEW rep (Jon's checklist, 2026-08-26): they start
// with ONLY these sections visible; the owner widens access per person in
// Admin → Access preview as they ramp. Every other "all"-gated section begins
// hidden. (Manager/marketing/C-Suite gates already exclude new reps by role,
// and C-Suite/pay data is hard-locked to Jon/Enrico/Viktoriia by name.)
export const NEW_REP_ALLOWED = new Set<string>([
  "/process", "/underwriting", "/schedule", "/rewards", "/culture",   // Overview
  "/entry", "/report",                                                 // Performance
  "/ai-training", "/call-scoring", "/scripts", "/glossary",            // Coaching
  "/rocks", "/vto", "/team-360",                                       // EOS
  "/tickets", "/software", "/ai-champion",                             // Requests & Support
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
