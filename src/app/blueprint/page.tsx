import { getCurrentUser, isCSuitePerson } from "@/lib/auth";
import BlueprintMap from "@/components/BlueprintMap";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// 🗺 The War Room Blueprint — C-suite only. What every room does, what data
// powers it, and how it maps to a sellable product later. This page IS the
// product spec: when Jon productizes, this is the feature list.
type Room = { path: string; name: string; what: string; data: string };
type Section = { title: string; emoji: string; pitch: string; rooms: Room[] };

const SECTIONS: Section[] = [
  {
    title: "Command Center", emoji: "🎛",
    pitch: "The daily heartbeat — what a team sees first and runs the morning on.",
    rooms: [
      { path: "/", name: "Dashboard", what: "Scoreboard: KPIs vs goals per rep, deal funnel, CRM activity pulse, lead-source and spend metrics.", data: "Entries + Targets + CrmActivity + Deals" },
      { path: "/huddle", name: "Daily Huddle", what: "9am stand-up board with auto-brief at 8:45 — yesterday's numbers, today's goals, blockers.", data: "Entries + Tasks + Google Chat" },
      { path: "/tv", name: "TV Mode", what: "Wall display loop for the office — public scoreboard, no login.", data: "same as Dashboard, read-only" },
      { path: "/entry", name: "KPI Entry", what: "Reps log daily numbers; auto-tracked KPIs fill themselves from the dialer/CRM. Each KPI shows WHY it matters.", data: "Entry/Target tables + auto-sync crons" },
      { path: "/report", name: "Reports", what: "Weekly/monthly rollups split Money Movers vs Activity; what got signed and why.", data: "Entries + Deals" },
      { path: "/benchmarks", name: "Benchmarks", what: "Channel spend vs results; cost per contract by lead source.", data: "Expenses + Deals + Entries" },
    ],
  },
  {
    title: "Acquisitions", emoji: "🧲",
    pitch: "A full GHL-replacement seller CRM — pipelines, calling, texting, email, forms, automations.",
    rooms: [
      { path: "/crm", name: "Seller CRM", what: "Kanban/List/Week pipelines (GHL-aligned), auto-apply filters, smart views, bulk edits, automations, pipeline editor, quick-view edit panel.", data: "CrmContact/Opportunity/Event/Task/Appointment/Party" },
      { path: "/crm/conversations", name: "Conversations", what: "Team inbox — every text, email and call per seller in one thread with composer.", data: "CrmEvent (sms/email/call)" },
      { path: "/crm/tasks", name: "Tasks", what: "Global task manager: due today / overdue / upcoming across every lead.", data: "CrmTask" },
      { path: "/crm/contacts", name: "Contacts", what: "Searchable master contact list with owner, stage, tags, last activity.", data: "CrmContact" },
      { path: "/crm/calendar", name: "Calendar", what: "Team-wide appointment agenda; alarms post to the huddle chat before each one.", data: "CrmAppointment" },
      { path: "/crm/dialer", name: "Power Dialer", what: "Due-follow-up queue with one-click outcomes; the browser softphone dials through it.", data: "CrmOpportunity.nextFollowUp" },
      { path: "— softphone", name: "Browser Phone", what: "Telnyx WebRTC: outbound + inbound ring-all (every rep's browser rings, first answer wins), local-presence caller ID, mid-call touch-tones, missed-call text-back.", data: "Telnyx Call Control + per-agent SIP credentials" },
      { path: "/underwriting", name: "Underwriting", what: "Multi-exit MAO calculator (assignment/novation/creative/listing/flip) + comps + AI assistant.", data: "RentCast/DealMachine APIs" },
    ],
  },
  {
    title: "Dispositions", emoji: "🤝",
    pitch: "Sell every deal inside 24 hours — buyers, packets, cascades, closing.",
    rooms: [
      { path: "/deals", name: "Deals Board", what: "Dispo kanban with 24h clock per deal, pass rollups, buyer-send tracking, Excel/Sheets sync.", data: "Deal + DealSend + Google Sheets API" },
      { path: "/marketing", name: "Vetted Buyers", what: "Buyer database + ping-tree cascade: auto-email waterfall (top 3 → next 3) with signed claim/pass links.", data: "Buyer tables + Resend" },
      { path: "/vetting", name: "Buyer Research", what: "Vetting pipeline that feeds dispo KPIs automatically.", data: "Buyer research tables" },
      { path: "/closing", name: "Escrow & Closing", what: "Per-deal expense + profit tracker through close.", data: "Deal + ledger" },
      { path: "— packets", name: "Deal Packets", what: "Auto-generated land packets (under-contract vs working-with-seller variants) for buyer sends.", data: "/api/packet" },
    ],
  },
  {
    title: "Business Heartbeat", emoji: "🫀",
    pitch: "Compliance, phones, money — the stuff that kills companies when ignored.",
    rooms: [
      { path: "/compliance", name: "Compliance", what: "State-law matrix, channel playbooks, live Twilio/Telnyx number monitoring.", data: "Telnyx/Twilio APIs" },
      { path: "/phone-health", name: "Phone Health", what: "Answer-rate playbook + number rotation tracker.", data: "Resource store" },
      { path: "/expenses", name: "P&L", what: "Monthly profit & loss with close cadence; subscription tracking.", data: "Expense table" },
      { path: "/closing-calc", name: "Closing Calculator", what: "Net-to-seller / net-to-us calculator for closings.", data: "client-side" },
    ],
  },
  {
    title: "Team OS", emoji: "👥",
    pitch: "The people layer — schedule, payroll inputs, growth, culture. This is what makes it an operating system, not a CRM.",
    rooms: [
      { path: "/schedule", name: "Schedule & Time", what: "Live availability board, time card punches, time-off calendar.", data: "Punch/TimeOff tables" },
      { path: "/team-roster", name: "Roster", what: "Revenue per person, promotion ladder, pay scales, manual adjustments.", data: "User + Deals + roster-revenue" },
      { path: "/team-360", name: "Team 360", what: "Quarterly peer reviews — superpowers, strengths, growth.", data: "Assessment tables" },
      { path: "/rewards", name: "Rewards", what: "Recognition + reward order links.", data: "Resource store" },
      { path: "/culture", name: "Culture", what: "Wins, shout-outs, team activity ideas.", data: "Resource store" },
      { path: "/training", name: "Training", what: "SOPs, process maps (LAND Dispo 24h SOP), call scripts, tutorials.", data: "Resource + training-tips" },
    ],
  },
  {
    title: "Owner's Suite", emoji: "👑",
    pitch: "C-suite locked. Strategy, money, and the levers only leadership touches.",
    rooms: [
      { path: "/c-suite", name: "C-Suite", what: "Financials, payroll, roadmap — hard-locked to 4 named people, no toggle grants it.", data: "C-suite lock in auth.ts" },
      { path: "/admin", name: "Admin", what: "Users, per-person nav access (hide any section), KPI installer, goal recalibration.", data: "User.navHidden + RESTRICTED_NAV" },
      { path: "/ai-updates", name: "AI Updates", what: "The app improves itself: AI proposes upgrades nightly, owner approves, agents build.", data: "Suggestion queue + scheduled agents" },
      { path: "/blueprint", name: "Blueprint", what: "This page — the product spec for the future SaaS.", data: "static" },
      { path: "— Cortana", name: "Cortana Assistant", what: "AI bot on every page: analyzes the open screen, doubles as the tutorial, audit-logged.", data: "Anthropic API" },
    ],
  },
];

export default async function BlueprintPage() {
  const me = await getCurrentUser();
  if (!me || !isCSuitePerson(me)) return <Card className="p-10 text-center text-slate-400">🔒 Owner's suite only.</Card>;
  return (
    <div className="space-y-6">
      <SectionTitle title="🗺 War Room Blueprint" subtitle="Every room, what it does, and the data behind it — this doubles as the product spec for the day we sell this as software." accent="bg-brand-gold" />
      <Card className="p-4 text-sm leading-relaxed text-slate-600">
        <b className="text-slate-800">Productization thesis:</b> one login replaces GHL (CRM+phones) + spreadsheet scorecards + Direct REI drips + separate schedulers. The sellable unit is a <b>vertical operating system for land/wholesale teams</b>: KPIs with WHY, a seller CRM with built-in telephony, 24-hour dispo workflow, and a team OS — pre-wired to Telnyx, Resend, Google, PandaDoc. Multi-tenant work needed later: org table + per-org env + billing. Everything below already runs in production for Freedom Offers.
      </Card>
      <BlueprintMap sections={SECTIONS} />
    </div>
  );
}
