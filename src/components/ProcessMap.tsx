"use client";

import { useState } from "react";

type Phase = {
  n: number;
  title: string;
  dept: keyof typeof DEPT;
  owner: string;
  steps: string[];
  branches?: string[];
  aiAssist: string[]; // AI helps the human
  aiAuto: string[]; // AI can run this repeatable task
};

const DEPT = {
  Marketing: { chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500", sel: "ring-sky-400 bg-sky-50" },
  Acquisitions: { chip: "bg-amber-100 text-amber-700", dot: "bg-amber-500", sel: "ring-amber-400 bg-amber-50" },
  Underwriting: { chip: "bg-teal-100 text-teal-700", dot: "bg-teal-500", sel: "ring-teal-400 bg-teal-50" },
  Dispositions: { chip: "bg-violet-100 text-violet-700", dot: "bg-violet-500", sel: "ring-violet-400 bg-violet-50" },
  Escrow: { chip: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500", sel: "ring-indigo-400 bg-indigo-50" },
  Closing: { chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", sel: "ring-emerald-400 bg-emerald-50" },
} as const;

const GROUPS: { label: string; phases: Phase[] }[] = [
  {
    label: "Acquire the deal",
    phases: [
      {
        n: 1, title: "Lead generation", dept: "Marketing", owner: "Marketing / PPL",
        steps: ["PPL, text, direct-mail or off-market lead comes in.", "Logged to the CRM (REI Reply) and surfaced in the War Room."],
        aiAssist: ["Lead scoring + routing to the right acquisitions rep.", "De-dupe & enrich against existing records."],
        aiAuto: ["Speed-to-lead: auto text/voicemail back within seconds of a new lead."],
      },
      {
        n: 2, title: "Process call", dept: "Acquisitions", owner: "Acquisitions (Michelle)",
        steps: ["AQ calls the new lead.", "Completes the discovery/process call: motivation, condition, timeline, price."],
        aiAssist: ["Live call scoring + coaching (already in the War Room).", "Suggested next step based on the conversation."],
        aiAuto: ["Transcribe the call, write the summary, and push notes back to the CRM."],
      },
      {
        n: 3, title: "Underwriting & comps", dept: "Underwriting", owner: "Underwriting",
        steps: ["Lead handed to underwriting for comps.", "Estimate ARV + repairs, set the buy box / max offer (MAO)."],
        aiAssist: ["MAO via the War Room underwriting calculator (Assignment / Novation / Creative).", "Repair-cost ranges from listing photos."],
        aiAuto: ["Auto-pull comps and a first-pass ARV estimate."],
      },
      {
        n: 4, title: "Offer call & negotiation", dept: "Acquisitions", owner: "Acquisitions",
        steps: ["AQ calls back with the offer.", "Negotiates, handles objections, works toward terms."],
        branches: ["✅ Agreed → Contract", "🕗 Not yet → Follow-up nurture", "❌ No deal → Dead"],
        aiAssist: ["Objection-handling prompts + recommended counter.", "Negotiation talking points pulled from the numbers."],
        aiAuto: ["Schedule the follow-up cadence for 'not yet' leads automatically."],
      },
      {
        n: 5, title: "Contract signed", dept: "Acquisitions", owner: "Acquisitions",
        steps: ["Get the purchase agreement signed.", "If stalled → follow-up. If it won't work → mark Dead."],
        branches: ["✍️ Signed → hand to dispositions", "🔁 Follow-up", "❌ Dead"],
        aiAssist: ["Auto-generate the contract from the deal data.", "Nurture sequences for dead/cold leads."],
        aiAuto: ["E-sign send + reminder sequence until signed."],
      },
    ],
  },
  {
    label: "Prep & market",
    phases: [
      {
        n: 6, title: "TC handoff & homeowner care", dept: "Dispositions", owner: "Sharyn (TC / Dispo)",
        steps: ["Sharyn calls the homeowner and introduces herself.", "Schedules photos + walkthrough for our agent / team member.", "Weekly Monday update calls to the homeowner until close."],
        aiAssist: ["Draft the warm intro message.", "Reminders so no Monday update is missed."],
        aiAuto: ["Draft the weekly Monday homeowner update + auto-schedule the walkthrough."],
      },
      {
        n: 7, title: "Photos & go-to-market", dept: "Dispositions", owner: "Dispositions / Agent",
        steps: ["Agent or team member gets photos.", "Market by exit: Novation → list on MLS · Off-market → off-market buyers · Luxury off-market → developers."],
        aiAssist: ["Match the deal to our vetted buyers (deal→buyer matcher in the War Room).", "Auto-CMA for pricing."],
        aiAuto: ["Write the listing copy + the buyer-blast email and send to matched buyers."],
      },
    ],
  },
  {
    label: "Sell to a buyer",
    phases: [
      {
        n: 8, title: "Buyer acquisition", dept: "Dispositions", owner: "Dispositions (Sharyn)",
        steps: ["Developers / buyers walk the property and submit offers.", "Negotiate; buyer signs the assignment agreement.", "Buyer puts EMD into escrow."],
        branches: ["🤝 Assignment signed → Escrow", "💵 Or double-close path"],
        aiAssist: ["Rank & compare buyer offers side by side.", "Track who walked, who offered, who's warm."],
        aiAuto: ["Automated buyer follow-up until offers are in."],
      },
    ],
  },
  {
    label: "Escrow & close",
    phases: [
      {
        n: 9, title: "Open escrow", dept: "Escrow", owner: "Dispositions / Escrow",
        steps: ["Escrow initiated — run a preliminary title early so we're not waiting.", "Send the packet: A contract (initial purchase agreement), B contract (with end buyer), our wiring instructions, all parties' contact info.", "Notify escrow to keep all parties on separate email chains."],
        aiAssist: ["Parties tracker; nothing falls through the cracks.", "Reminders on missing documents."],
        aiAuto: ["Assemble the escrow doc packet + verify the checklist is complete."],
      },
      {
        n: 10, title: "Title & escrow in progress", dept: "Escrow", owner: "Escrow / Dispositions",
        steps: ["Escrow runs title & escrow.", "EMD loaded; all funds loaded.", "Hand-hold every party toward the close."],
        aiAssist: ["Deadline & contingency monitoring with alerts.", "A live status dashboard for the deal."],
        aiAuto: ["Automated nudges to each party as deadlines approach."],
      },
      {
        n: 11, title: "Closing day", dept: "Closing", owner: "Jon / Dispositions",
        steps: ["Review the HUD: confirm our assignment fee is on it (or, on a double close, stated properly) and every fee is correct.", "Close. Record.", "Receive the wire — usually same day or the next."],
        aiAssist: ["AI HUD review: verify the assignment fee, flag fee discrepancies before signing.", "Wire-received confirmation."],
        aiAuto: ["HUD line-item verification + discrepancy flagging."],
      },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.phases);

export default function ProcessMap() {
  const [sel, setSel] = useState(1);
  const phase = ALL.find((p) => p.n === sel)!;
  const d = DEPT[phase.dept];

  return (
    <div className="space-y-5">
      {/* Department legend */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        {Object.entries(DEPT).map(([name, c]) => (
          <span key={name} className="inline-flex items-center gap-1.5 text-slate-500">
            <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} /> {name}
          </span>
        ))}
      </div>

      {/* Flow of phase nodes, grouped by macro-stage */}
      <div className="space-y-3">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.label}</div>
            <div className="flex flex-wrap items-stretch gap-2">
              {g.phases.map((p) => {
                const pd = DEPT[p.dept];
                const active = p.n === sel;
                return (
                  <button
                    key={p.n}
                    type="button"
                    onClick={() => setSel(p.n)}
                    className={`flex min-w-[140px] flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${active ? `ring-2 ${pd.sel} border-transparent` : "border-slate-200 bg-white hover:border-slate-300"}`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${pd.dot}`}>{p.n}</span>
                    <span className="text-sm font-semibold leading-tight text-slate-800">{p.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Detail panel for the selected phase */}
      <div className={`rounded-2xl border p-5 ring-1 ${d.sel} ring-transparent`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold text-white ${d.dot}`}>{phase.n}</span>
          <h3 className="text-lg font-bold text-slate-900">{phase.title}</h3>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${d.chip}`}>{phase.dept}</span>
          <span className="ml-auto text-xs font-medium text-slate-500">Owner: {phase.owner}</span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Steps</div>
            <ul className="space-y-1.5 text-sm text-slate-700">
              {phase.steps.map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-slate-400">{i + 1}.</span><span>{s}</span></li>
              ))}
            </ul>
            {phase.branches && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Outcomes</div>
                <div className="flex flex-wrap gap-1.5">
                  {phase.branches.map((b, i) => <span key={i} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{b}</span>)}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200">
              <div className="mb-1 text-xs font-bold text-slate-700">💡 AI assists the team</div>
              <ul className="space-y-1 text-sm text-slate-600">
                {phase.aiAssist.map((a, i) => <li key={i} className="flex gap-2"><span>•</span><span>{a}</span></li>)}
              </ul>
            </div>
            <div className="rounded-xl bg-brand-navy p-3">
              <div className="mb-1 text-xs font-bold text-brand-gold-soft">🤖 AI can run this (repeatable)</div>
              <ul className="space-y-1 text-sm text-brand-navy-100">
                {phase.aiAuto.map((a, i) => <li key={i} className="flex gap-2"><span className="text-brand-gold-soft">›</span><span>{a}</span></li>)}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button type="button" disabled={sel === 1} onClick={() => setSel((n) => Math.max(1, n - 1))} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-brand-navy disabled:opacity-30">← Previous</button>
          <span className="text-xs text-slate-400">Phase {phase.n} of {ALL.length}</span>
          <button type="button" disabled={sel === ALL.length} onClick={() => setSel((n) => Math.min(ALL.length, n + 1))} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-brand-navy disabled:opacity-30">Next →</button>
        </div>
      </div>
    </div>
  );
}
