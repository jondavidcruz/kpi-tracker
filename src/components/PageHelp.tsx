"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

type Topic = { title: string; intro: string; steps: string[]; tip?: string };

// One tutorial per section. Keyed by route prefix; longest match wins.
const HELP: Record<string, Topic> = {
  "/dashboard": {
    title: "Dashboard",
    intro: "Your daily scoreboard — where the company stands right now.",
    steps: [
      "Company Scoreboard: contracts sent/signed this month, deals closed + revenue + net profit this year (auto-tallied — no entry needed).",
      "Deal funnel: leads → opportunities → appointments → offers → contracts → closed, with the conversion % between each stage.",
      "Performance gaps: who's behind today and what it takes to catch up.",
      "Use the ← date picker to look at a past day.",
    ],
    tip: "Revenue & profit only show for leadership (Jon, Viktoriia, Enrico).",
  },
  "/huddle": {
    title: "Daily Huddle",
    intro: "Run the 9 AM stand-up role by role. Fill your part before the meeting.",
    steps: [
      "Top shows accountability: yesterday's KPI misses + reasons, and who's on a PIP (works Saturday).",
      "Each person sets today's goal + what's pending from yesterday.",
      "Acquisitions: add your hottest leads — status, roadblock, next step, what we do today.",
      "Dispositions: your active deals appear from the Deals board; add buyer/lost/price-reduction notes.",
      "You can only edit your own card; managers edit everyone's. Tick 'submitted' when done.",
    ],
    tip: "An 8:45 AM brief auto-posts to Chat + email so the huddle runs even if Jon's out.",
  },
  "/underwriting": {
    title: "Underwriting Calculator",
    intro: "Figure out your Max Allowable Offer (MAO) for any exit.",
    steps: [
      "Pick the exit tab: Assignment, Novation, Creative, Listing, or Flip.",
      "🔴 Red fields are required to get an MAO; 🟡 amber fields refine it.",
      "Comps are required — pull them AND verify manually on MLS/county, then enter all 3.",
      "The MAO is your max offer; the anchor is where you open. Negotiate up to the MAO.",
      "Bottom: enter the seller's asking price (red) and accepted price (green) for the true margin.",
      "Export PDF saves a clean report for the CRM.",
    ],
    tip: "Stuck on which exit? Open the 'Wholesale vs Novation' guide on those tabs, or ask Cortana.",
  },
  "/closing": {
    title: "Escrow & Closing",
    intro: "Track each deal in escrow and its true net profit.",
    steps: [
      "Add a deal: address, buyer, exit, revenue, lead source, market.",
      "Add every expense as a line (title/escrow, TC, concessions, commission…).",
      "Net profit + margin calculate automatically.",
      "Set status to Closed when it funds; Fell-through + a reason if it dies.",
    ],
    tip: "Closed deals here feed the dashboard scoreboard and the Benchmarks page.",
  },
  "/benchmarks": {
    title: "Marketing & Financial Benchmarks",
    intro: "Cost, conversion, and profit metrics — by channel.",
    steps: [
      "Enter this month's spend per channel (PPL/SMS/mail) + email rates at the top.",
      "Marketing card shows cost-per-lead, cost-per-contract, lead→contract %, ROI.",
      "Closings card shows net profit, net per deal, avg assignment fee, contract→close %.",
      "'Closed deals by lead source' tells you which channel actually produces the best.",
    ],
    tip: "Tag each closed deal's source in Escrow & Closing so the by-source numbers fill in.",
  },
  "/timecard": {
    title: "Payroll",
    intro: "Semi-monthly pay (15th & last day), day-by-day per person.",
    steps: [
      "Each person's days show worked vs paid hours; weekly subtotals roll them up.",
      "Marie's entered hours are what pays; clock-tracked hours show beside with a variance flag.",
      "Add bonuses (with a reason) and a discrepancy/clawback if needed.",
      "Use ← → to move between pay periods.",
    ],
    tip: "Leadership only. Forgotten clock-outs auto-cap at the scheduled shift end.",
  },
  "/schedule": {
    title: "Schedule & Time",
    intro: "Live availability, your time card, time off, and outages.",
    steps: [
      "Time card: Clock In → Break/Lunch → End of day. Your status is saved on the server.",
      "The board shows who's online / on break / offline right now.",
      "Request time off on the calendar; managers approve.",
      "Report a power/internet outage so the unpaid time comes off your hours.",
    ],
  },
  "/marketing": {
    title: "Vetted Buyers",
    intro: "Your vetted cash-buyers & developers and their buy boxes — match a deal to the right buyer.",
    steps: [
      "Search the map by market to see which vetted buyers buy there.",
      "Same spreadsheet as Buyer Research, grouped Developers / Fix & Flippers — click any cell to edit; ⊕ opens the full buy box.",
      "The Buy box column shows deal/build type, price, and areas at a glance.",
      "New buyers are added in Buyer Research first; set a buyer's Status back to a working stage to send them there.",
    ],
    tip: "Restricted to Sharyn, Marie, Viktoriia, and Jon.",
  },
  "/vetting": {
    title: "Buyer Research",
    intro: "Source and vet new buyers/developers before they graduate to Vetted Buyers.",
    steps: [
      "One spreadsheet table per deal area — the developers we're researching for that opportunity (columns mirror your old sheet).",
      "Click any cell to edit (autosaves). The ⊕ by a name opens the full buy box — Deal Type & Build Type let you pick MULTIPLE.",
      "Set Status: To contact → Contacted → Messaged → Following up. Hit ✓ Vetted to move them to Vetted Buyers, or ✕ Not interested to archive.",
      "📇 logs a touch (counts toward Buyers Contacted) + sets a 3-day follow-up. Use the search + type/status filters up top.",
    ],
    tip: "Follow-ups due today show in the red card up top. Start a new area when a new deal comes in.",
  },
  "/report": {
    title: "KPI Reports",
    intro: "Team & per-rep KPI totals for any day, week, or month.",
    steps: [
      "Toggle Day / Week / Month and This / Previous up top — goals scale to the range.",
      "KPIs at a Glance = team totals; Team KPIs = every rep vs their own goal, color-coded.",
      "Revenue pipeline + active deals show for leadership.",
    ],
    tip: "Switch to Monthly financials with the tab at the top.",
  },
  "/monthly": {
    title: "Monthly Financials",
    intro: "Monthly company numbers, computed ratios, and per-rep monthly totals.",
    steps: [
      "Enter the month's company numbers (leadership only).",
      "Computed ratios — cost/lead, ROI, net margin — calculate live, no spreadsheet drift.",
      "Per-rep totals roll up each rep's daily entries for the month.",
    ],
  },
  "/analytics": {
    title: "Year Analytics",
    intro: "Year-to-date totals and monthly KPI movement.",
    steps: [
      "YTD totals up top; monthly trend below.",
      "Use it to spot what's rising or falling across the year.",
    ],
    tip: "Leadership only.",
  },
  "/internet": {
    title: "Internet Speed",
    intro: "Connectivity tracking for the team.",
    steps: [
      "See each rep's logged speeds and any low-speed flags.",
      "Slow speeds trigger alerts so connectivity issues get fixed fast.",
    ],
  },
  "/training": {
    title: "Training Portal",
    intro: "Coaching schedule, focus areas, and an AI coach.",
    steps: [
      "Each rep's 30-min training sessions + their focus areas with the right coaching method.",
      "Use the AI Coach for openers, objection handling, role-play, feedback, or a quick drill.",
      "The coaching-method guide shows when to audit calls vs use other methods.",
    ],
  },
  "/leaks": {
    title: "War Room Health",
    intro: "Where the funnel leaks — diagnosed in plain English.",
    steps: [
      "Funnel bars: leads → process calls → offers → signed → closed, with the biggest leak called out.",
      "Lead/refund accounting + unit economics by conversion.",
      "'What this means' explains it; the AI deep-dive goes further.",
    ],
    tip: "A Leaks report auto-posts to C-Suite every Friday.",
  },
  "/expenses": {
    title: "Profit & Loss",
    intro: "QuickBooks-style P&L — income, expenses, and what to trim.",
    steps: [
      "Year-to-date income leads; categorized expenses below.",
      "Track actual monthly spend per category; cost-per-lead is baked in.",
      "The 'Cut the fat' AI CFO suggests where to trim.",
    ],
    tip: "C-Suite only (Jon, Viktoriia, Enrico).",
  },
  "/deals": {
    title: "Deals",
    intro: "The dispositions pipeline — active deals being sold.",
    steps: [
      "Each deal: address, status, assigned rep, contract price, est. profit, next steps.",
      "Aging flags old deals; reduction alerts fire when a deal sits too long.",
      "Move deals through the pipeline toward escrow and closed.",
    ],
  },
  "/rewards": {
    title: "Rewards",
    intro: "Team rewards and the wishlist.",
    steps: [
      "See rewards the team can earn.",
      "The team can submit a wishlist of what they'd like.",
    ],
    tip: "Visible to Jon, Viktoriia, and Enrico.",
  },
  "/tickets": {
    title: "Requests & Tickets",
    intro: "Submit and triage support / change requests.",
    steps: [
      "Anyone can submit a ticket describing the issue or request.",
      "Managers triage: prioritize, assign, and resolve.",
    ],
  },
  "/pip": {
    title: "PIPs",
    intro: "Performance Improvement Plans.",
    steps: [
      "Reps on a PIP for repeated misses work Saturday until cleared.",
      "Track the plan and clear it when the KPI recovers.",
    ],
    tip: "Managers only.",
  },
  "/rocks": {
    title: "Rocks",
    intro: "EOS Rocks — the quarterly priorities.",
    steps: [
      "Each Rock has an owner and a due date.",
      "Mark on / off track and review them at L10.",
    ],
  },
  "/issues": {
    title: "Issues List",
    intro: "EOS Issues — IDS (Identify, Discuss, Solve).",
    steps: [
      "Drop any issue here as it comes up.",
      "At L10, work the top issues IDS-style and mark them solved.",
    ],
  },
  "/vto": {
    title: "Vision / Traction (V/TO)",
    intro: "The company vision on one page.",
    steps: [
      "Core values, focus, 10-year target, marketing strategy.",
      "1-year plan + quarterly Rocks keep it actionable.",
    ],
  },
  "/meeting": {
    title: "Leadership Meeting",
    intro: "The Monday leadership meeting view.",
    steps: [
      "Pulls the week's KPIs, revenue, and priorities into a meeting flow.",
      "Run it top to bottom with the leadership team.",
    ],
  },
  "/operations": {
    title: "Vendors & Tools",
    intro: "The vendor / software registry.",
    steps: [
      "Each tool or vendor: what it's for, cost, and who owns the login.",
      "Reference it when onboarding or reviewing spend.",
    ],
  },
  "/closed-deals": {
    title: "Closed Deals",
    intro: "Every closed deal and its profit.",
    steps: [
      "Closed deals here feed the dashboard scoreboard and Benchmarks.",
    ],
  },
  "/trends": {
    title: "Trends",
    intro: "KPI movement over time.",
    steps: ["See how each KPI moves week over week to catch drift early."],
  },
  "/scripts": {
    title: "Scripts",
    intro: "Approved call scripts.",
    steps: [
      "Reference the script for each call type.",
      "Call Scoring grades calls against these.",
    ],
  },
  "/change-portal": {
    title: "Change Portal",
    intro: "Request a change to the War Room.",
    steps: ["Describe what you want changed or added — it's tracked like a ticket."],
  },
  "/roadmap": {
    title: "Roadmap",
    intro: "What's shipped and what's coming.",
    steps: ["See delivered features and what's planned next."],
  },
  "/process": {
    title: "Process Map",
    intro: "The visual deal pipeline, A→Z.",
    steps: [
      "Click any stage to see the steps, the SOP, and the checklist for it.",
      "Filter by role to see only your part of the pipeline.",
      "Use it to onboard or to settle 'what happens next' questions.",
    ],
  },
  "/entry": {
    title: "Enter KPIs",
    intro: "Log your daily numbers.",
    steps: [
      "Pick yourself, then enter each KPI for the day.",
      "Use the date picker at the top to log a past day you missed.",
      "Run the internet speed test if it shows on your screen.",
    ],
  },
  "/alerts": {
    title: "Alerts",
    intro: "Off-target KPIs that need a justification.",
    steps: [
      "Each alert is a missed goal. Add why it happened and the fix.",
      "Resolve it once addressed — every closed alert is a documented decision.",
      "Marie should clear these by end of day (7 PM).",
    ],
  },
  "/call-scoring": {
    title: "Call Scoring",
    intro: "Instant coaching score on an acquisitions call.",
    steps: [
      "Upload a recording (auto-transcribed) or paste a transcript.",
      "Pick the rep and call type.",
      "Get a 0–100 score per skill + the single highest-leverage fix.",
    ],
    tip: "Recordings are transcribed on the fly and never stored.",
  },
};

function topicFor(path: string): Topic | null {
  const p = (path || "").split("?")[0];
  let best: string | null = null;
  for (const key of Object.keys(HELP)) if (p.startsWith(key) && (!best || key.length > best.length)) best = key;
  return best ? HELP[best] : null;
}

// Fallback so EVERY page always has a "how to use" tutorial, even brand-new ones.
function genericTopic(path: string): Topic {
  const seg = (path || "").split("?")[0].split("/").filter(Boolean)[0] || "page";
  const title = seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title,
    intro: `Quick guide to the ${title} page.`,
    steps: [
      "Everything here updates live from the team's real data — no manual refresh.",
      "Leadership and managers may see extra sections others don't.",
      "Hover or tap a control to see what it does; most edits save on the spot.",
    ],
    tip: "Need specifics? Tap the Cortana orb (bottom-right) — it can read this exact screen and walk you through it.",
  };
}

export default function PageHelp() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const topic = topicFor(path) ?? genericTopic(path); // always show a tutorial

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 left-5 z-40 flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-brand-navy shadow-lg ring-1 ring-slate-200 transition hover:ring-brand-gold/50"
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-navy text-xs text-white">?</span>
          How to use this page
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-0 left-0 top-0 flex w-[min(420px,92vw)] flex-col bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-navy text-sm font-bold text-white">?</span>
              <div className="flex-1"><div className="text-base font-bold text-slate-800">{topic.title}</div><div className="text-xs text-slate-500">How to use this section</div></div>
              <button onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-3 text-sm text-slate-600">{topic.intro}</p>
              <ol className="space-y-2">
                {topic.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-gold/20 text-[11px] font-bold text-brand-navy">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              {topic.tip && <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">💡 {topic.tip}</div>}
              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">Still stuck? Tap the <span className="font-semibold text-cyan-600">Cortana</span> orb (bottom-right) and ask anything about this screen.</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
