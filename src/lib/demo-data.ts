// 🎭 DEMO DATA — 100% fake, deterministic sample data for the public /demo showcase.
// This file imports NOTHING from the real DB/auth and is the ONLY data source the demo uses,
// so the demo can be shown to anyone with zero real seller/buyer/payroll/financial exposure.
// Everything here is invented. Company is simply "Demo". Keep it realistic but obviously not real.

export const DEMO_COMPANY = "Demo";
export const DEMO_TODAY = "Today";

// ── KPI scoreboard (per-rep, today) ──────────────────────────────────────────────────────────────
export type DemoKpiRep = { name: string; role: string; dials: number; connects: number; offers: number; pace: number /* 0-100 */ };
export const DEMO_KPI_REPS: DemoKpiRep[] = [
  { name: "Alex Rivera", role: "Acquisitions", dials: 142, connects: 19, offers: 4, pace: 96 },
  { name: "Jordan Kim", role: "Acquisitions", dials: 118, connects: 14, offers: 3, pace: 78 },
  { name: "Sam Patel", role: "Acquisitions", dials: 97, connects: 11, offers: 2, pace: 64 },
  { name: "Taylor Brooks", role: "Dispositions", dials: 61, connects: 22, offers: 6, pace: 88 },
  { name: "Casey Nguyen", role: "Lead Manager", dials: 203, connects: 27, offers: 1, pace: 71 },
];

// ── Headline tiles ───────────────────────────────────────────────────────────────────────────────
export type DemoTile = { label: string; value: string; sub: string; tone: "good" | "warn" | "neutral" | "gold" };
export const DEMO_TILES: DemoTile[] = [
  { label: "New seller leads (wk)", value: "48", sub: "+12 vs last week", tone: "good" },
  { label: "Offers made (wk)", value: "16", sub: "33% of new leads", tone: "neutral" },
  { label: "Under contract", value: "7", sub: "3 closing this month", tone: "gold" },
  { label: "Deals closed (mo)", value: "5", sub: "$142,500 assignment fees", tone: "good" },
  { label: "Avg speed-to-lead", value: "4m 20s", sub: "goal < 5m", tone: "good" },
  { label: "Text reply rate", value: "11.4%", sub: "Direct REI campaigns", tone: "neutral" },
];

// ── Pipeline funnel (this month) ─────────────────────────────────────────────────────────────────
export const DEMO_FUNNEL: { stage: string; count: number }[] = [
  { stage: "Leads pulled", count: 4211 },
  { stage: "Responded", count: 362 },
  { stage: "Qualified", count: 94 },
  { stage: "Offer made", count: 31 },
  { stage: "Under contract", count: 7 },
  { stage: "Closed", count: 5 },
];

// ── Seller CRM kanban ────────────────────────────────────────────────────────────────────────────
export type DemoLead = { name: string; address: string; value: number; heat: "hot" | "warm" | "cold"; note: string };
export type DemoStage = { stage: string; color: string; leads: DemoLead[] };
export const DEMO_PIPELINE: DemoStage[] = [
  { stage: "New", color: "#64748b", leads: [
    { name: "M. Thompson", address: "North Port, FL 34287", value: 18000, heat: "warm", note: "Texted back — wants a cash number" },
    { name: "R. Garcia", address: "Palm Bay, FL 32908", value: 12500, heat: "cold", note: "Vacant 0.25ac lot, out-of-state owner" },
    { name: "D. Wallace", address: "Ocala, FL 34470", value: 22000, heat: "warm", note: "Inherited land, motivated" },
  ] },
  { stage: "Contacted", color: "#3b82f6", leads: [
    { name: "P. Okafor", address: "Sebring, FL 33875", value: 9500, heat: "hot", note: "Call booked Thursday 2pm" },
    { name: "L. Rossi", address: "Cape Coral, FL 33993", value: 15000, heat: "warm", note: "Asked for proof of funds" },
  ] },
  { stage: "Offer made", color: "#14b8a6", leads: [
    { name: "T. Brooks", address: "Lehigh Acres, FL 33974", value: 16500, heat: "hot", note: "Offered $16.5k — following up Fri" },
    { name: "K. Nguyen", address: "Port Charlotte, FL 33954", value: 21000, heat: "warm", note: "Countered at $24k, negotiating" },
  ] },
  { stage: "Under contract", color: "#10b981", leads: [
    { name: "S. Delgado", address: "Bunnell, FL 32110", value: 28000, heat: "hot", note: "Signed — assigned to builder, $9k spread" },
  ] },
];

// ── Deals & revenue ──────────────────────────────────────────────────────────────────────────────
export type DemoDeal = { address: string; buyer: string; sold: number; fee: number; type: string; when: string };
export const DEMO_DEALS: DemoDeal[] = [
  { address: "North Port, FL 34291", buyer: "Coastal Land Builders", sold: 41000, fee: 11500, type: "Assignment", when: "3 days ago" },
  { address: "Palm Coast, FL 32164", buyer: "Evergreen Homes LLC", sold: 36500, fee: 9000, type: "Novation", when: "1 week ago" },
  { address: "Ocala, FL 34480", buyer: "Mom & Pop (R. Diaz)", sold: 24000, fee: 7000, type: "Assignment", when: "2 weeks ago" },
  { address: "Lehigh Acres, FL 33972", buyer: "Sunbelt Developers", sold: 52000, fee: 14000, type: "Double close", when: "3 weeks ago" },
  { address: "Sebring, FL 33870", buyer: "Coastal Land Builders", sold: 19500, fee: 6000, type: "Assignment", when: "last month" },
];

// ── Markets coverage ─────────────────────────────────────────────────────────────────────────────
export type DemoMarket = { name: string; status: "clear" | "cooldown" | "never"; leads: number; deals: number; trend: "up" | "flat" | "down" };
export const DEMO_MARKETS: DemoMarket[] = [
  { name: "Sarasota / North Port", status: "cooldown", leads: 41, deals: 3, trend: "up" },
  { name: "Cape Coral / Lehigh Acres", status: "clear", leads: 33, deals: 2, trend: "up" },
  { name: "Palm Bay / Melbourne", status: "cooldown", leads: 28, deals: 1, trend: "flat" },
  { name: "Ocala / Marion", status: "clear", leads: 22, deals: 2, trend: "up" },
  { name: "Palm Coast / Flagler", status: "never", leads: 0, deals: 0, trend: "flat" },
  { name: "Port St. Lucie", status: "cooldown", leads: 17, deals: 0, trend: "down" },
];

// ── Team roster ──────────────────────────────────────────────────────────────────────────────────
export type DemoTeamMember = { name: string; role: string; revenue: number; status: "on" | "off" };
export const DEMO_TEAM: DemoTeamMember[] = [
  { name: "Alex Rivera", role: "Sr. Acquisitions", revenue: 184000, status: "on" },
  { name: "Jordan Kim", role: "Acquisitions", revenue: 121000, status: "on" },
  { name: "Sam Patel", role: "Acquisitions", revenue: 68000, status: "off" },
  { name: "Taylor Brooks", role: "Dispositions Lead", revenue: 212000, status: "on" },
  { name: "Casey Nguyen", role: "Lead Manager", revenue: 0, status: "on" },
  { name: "Morgan Lee", role: "Transaction Coordinator", revenue: 0, status: "on" },
];

// ── Sidebar groups (mirrors the real nav so the demo feels like the real War Room) ─────────────────
export const DEMO_NAV: { group: string; items: string[] }[] = [
  { group: "Team Overview", items: ["Dashboard", "Team Roster", "Schedule & Time", "Rewards"] },
  { group: "Acquisitions", items: ["Seller CRM", "Conversations", "Underwriting", "Follow-up Automation"] },
  { group: "Dispositions", items: ["Dispo CRM", "Deals", "Vetted Buyers", "Closing Calculator"] },
  { group: "Marketing", items: ["Target Markets", "Lead Sourcing"] },
  { group: "Business Heartbeat", items: ["Comms Guardian", "Compliance", "Litigator Protocol", "Phone Health"] },
  { group: "Performance", items: ["Enter KPIs", "KPI Reports", "Analytics", "Lead ROI"] },
  { group: "Coaching", items: ["What's New", "Training Portal", "Call Scoring", "Scripts"] },
  { group: "EOS", items: ["Monday Meeting", "Stoplight Check", "Rocks", "Issues"] },
];

// Which demo sections are actually built out (the rest show a tasteful "full app" panel).
export const DEMO_BUILT = new Set(["Dashboard", "Team Roster", "Seller CRM", "Deals", "Target Markets"]);
