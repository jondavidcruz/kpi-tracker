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
    title: "Markets & Buyers",
    intro: "Your cash-buyer & developer rolodex with buy boxes.",
    steps: [
      "Each contact has a structured buy box (price, areas, property type, terms).",
      "Filter the rolodex by type, market, or vetting stage.",
      "Move a buyer through the vetting workflow: to-vet → vetted → active.",
    ],
    tip: "Restricted to Sharyn, Marie, Viktoriia, and Jon.",
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

export default function PageHelp() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const topic = topicFor(path);
  if (!topic) return null; // no tutorial for this page → hide the button

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
