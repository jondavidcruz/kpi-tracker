"use client";

import { useEffect, useState } from "react";

type Phase = {
  n: number;
  title: string;
  dept: keyof typeof DEPT;
  owner: string;
  summary: string; // A→Z explanation
  steps: string[]; // interactive SOP checklist
  branches?: string[];
  aiAssist: string[];
  aiAuto: string[];
};

const DEPT = {
  Marketing: { chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500", sel: "ring-sky-400 bg-sky-50", bar: "bg-sky-400" },
  Acquisitions: { chip: "bg-amber-100 text-amber-700", dot: "bg-amber-500", sel: "ring-amber-400 bg-amber-50", bar: "bg-amber-400" },
  Underwriting: { chip: "bg-teal-100 text-teal-700", dot: "bg-teal-500", sel: "ring-teal-400 bg-teal-50", bar: "bg-teal-400" },
  Dispositions: { chip: "bg-violet-100 text-violet-700", dot: "bg-violet-500", sel: "ring-violet-400 bg-violet-50", bar: "bg-violet-400" },
  Escrow: { chip: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500", sel: "ring-indigo-400 bg-indigo-50", bar: "bg-indigo-400" },
  Closing: { chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", sel: "ring-emerald-400 bg-emerald-50", bar: "bg-emerald-400" },
} as const;

const PHASES: Phase[] = [
  { n: 1, title: "Lead generation", dept: "Marketing", owner: "Marketing / PPL",
    summary: "A new lead enters from PPL, text, direct mail, or an off-market source and is logged so acquisitions can work it fast.",
    steps: ["Lead lands in the CRM (REI Reply) + War Room", "Auto first-touch fires (speed-to-lead)", "Routed to the right acquisitions rep"],
    aiAssist: ["Lead scoring + routing", "De-dupe & enrich against existing records"],
    aiAuto: ["Speed-to-lead: auto text/voicemail within seconds of a new lead"] },
  { n: 2, title: "Process call", dept: "Acquisitions", owner: "Acquisitions (Michelle)",
    summary: "Acquisitions calls the lead and runs the discovery script to qualify motivation, condition, timeline, and price.",
    steps: ["Call the new lead", "Run the discovery/process script", "Capture motivation, condition, timeline, price", "Log notes + book the next step"],
    aiAssist: ["Live call scoring + coaching (in the War Room)", "Suggested next step from the conversation"],
    aiAuto: ["Transcribe, summarize, and write notes back to the CRM"] },
  { n: 3, title: "Underwriting & comps", dept: "Underwriting", owner: "Underwriting",
    summary: "Underwriting pulls comps, estimates ARV and repairs, and sets the market-tier MAO so we know our number before the offer call.",
    steps: ["Pull comps + ARV (Underwriting tab)", "Estimate repairs ($/sf by condition)", "Pick the market tier", "Set MAO + anchor; choose the exit"],
    aiAssist: ["MAO via the underwriting calculator", "Repair ranges from photos", "AI assistant recommends the exit"],
    aiAuto: ["Auto-pull comps + first-pass ARV"] },
  { n: 4, title: "Offer call & negotiation", dept: "Acquisitions", owner: "Acquisitions",
    summary: "Acquisitions presents the offer and negotiates; the deal moves to contract, goes to follow-up, or is marked dead.",
    steps: ["Open at the anchor", "Negotiate up to MAO", "Handle objections", "Lock terms or set the follow-up"],
    branches: ["✅ Agreed → Contract", "🕗 Not yet → Follow-up", "❌ No deal → Dead"],
    aiAssist: ["Objection-handling prompts + counter", "Talking points from the numbers"],
    aiAuto: ["Schedule the follow-up cadence for 'not yet' leads"] },
  { n: 5, title: "Contract signed", dept: "Acquisitions", owner: "Acquisitions",
    summary: "We get the purchase agreement signed and hand the deal to dispositions.",
    steps: ["Generate the purchase agreement", "Send for e-signature", "Confirm signed", "Hand off to dispositions"],
    branches: ["✍️ Signed → Dispositions", "🔁 Follow-up", "❌ Dead"],
    aiAssist: ["Auto-generate the contract from deal data", "Dead/cold-lead nurture"],
    aiAuto: ["E-sign send + reminder sequence until signed"] },
  { n: 6, title: "TC handoff & homeowner care", dept: "Dispositions", owner: "Sharyn (TC / Dispo)",
    summary: "Sharyn introduces herself to the homeowner, schedules photos + the walkthrough, and updates them every Monday until close.",
    steps: ["Intro call to the homeowner", "Schedule photos + walkthrough for the agent/team", "Set the weekly Monday update", "Log every touch"],
    aiAssist: ["Draft the warm intro message", "Monday-update reminders"],
    aiAuto: ["Draft the weekly Monday update + auto-schedule the walkthrough"] },
  { n: 7, title: "Photos & go-to-market", dept: "Dispositions", owner: "Dispositions / Agent",
    summary: "We get photos and market by exit — MLS for novation, our buyer list for off-market, developers for luxury off-market.",
    steps: ["Get photos", "Pick the exit: Novation → MLS · Off-market → buyer list · Luxury → developers", "Write the listing / blast", "Push to matched buyers"],
    aiAssist: ["Match the deal to vetted buyers (deal→buyer matcher)", "Auto-CMA pricing"],
    aiAuto: ["Write the listing copy + buyer-blast and send to matched buyers"] },
  { n: 8, title: "Buyer acquisition", dept: "Dispositions", owner: "Dispositions (Sharyn)",
    summary: "Buyers walk the property and submit offers; we negotiate, sign the assignment, and the buyer wires EMD to escrow.",
    steps: ["Buyers walk the property", "Collect + compare offers", "Negotiate; sign the assignment agreement", "Buyer wires EMD to escrow"],
    branches: ["🤝 Assignment signed → Escrow", "💵 Or double-close path"],
    aiAssist: ["Rank & compare buyer offers", "Track who walked / offered"],
    aiAuto: ["Automated buyer follow-up until offers are in"] },
  { n: 9, title: "Open escrow", dept: "Escrow", owner: "Dispositions / Escrow",
    summary: "We open escrow (with an early prelim so we're not waiting), send the A/B contracts + wiring + parties packet, and keep parties on separate email chains.",
    steps: ["Open escrow + order the preliminary title early", "Send A contract (purchase) + B contract (end buyer)", "Send our wiring instructions + all parties' contacts", "Tell escrow: keep parties on separate email chains"],
    aiAssist: ["Parties tracker", "Missing-document reminders"],
    aiAuto: ["Assemble the escrow doc packet + verify the checklist"] },
  { n: 10, title: "Title & escrow in progress", dept: "Escrow", owner: "Escrow / Dispositions",
    summary: "Escrow runs title, EMD and all funds load, and we hand-hold every party toward the close.",
    steps: ["Escrow runs title & escrow", "Confirm EMD loaded", "Confirm all funds loaded", "Hand-hold each party to the finish"],
    aiAssist: ["Deadline & contingency monitoring", "Live deal status dashboard"],
    aiAuto: ["Automated nudges to each party as deadlines approach"] },
  { n: 11, title: "Closing day", dept: "Closing", owner: "Jon / Dispositions",
    summary: "We review the HUD to confirm our fee and all costs, close, record, and receive the wire.",
    steps: ["Review the HUD — assignment fee present (or double-close stated)", "Verify every fee is correct", "Close + record", "Confirm the wire received"],
    aiAssist: ["AI HUD review — verify the fee, flag discrepancies", "Wire-received confirmation"],
    aiAuto: ["HUD line-item verification + discrepancy flagging"] },
];

const DEPTS = Array.from(new Set(PHASES.map((p) => p.dept)));
const STORE_KEY = "fo_process_checks";

export default function ProcessMap() {
  const [sel, setSel] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try { setChecks(JSON.parse(localStorage.getItem(STORE_KEY) || "{}")); } catch { /* ignore */ }
  }, []);
  const toggle = (key: string) => setChecks((prev) => {
    const next = { ...prev, [key]: !prev[key] };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  const phase = PHASES.find((p) => p.n === sel)!;
  const d = DEPT[phase.dept];
  const visible = PHASES.filter((p) => !roleFilter || p.dept === roleFilter);
  const doneCount = phase.steps.filter((_, i) => checks[`${phase.n}:${i}`]).length;

  return (
    <div className="space-y-5">
      {/* Role filter — each role's slice of the pipeline = their SOP */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-400">View role:</span>
        <button type="button" onClick={() => setRoleFilter("")} className={`rounded-full px-3 py-1 text-xs font-semibold ${roleFilter === "" ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Whole pipeline</button>
        {DEPTS.map((dep) => (
          <button key={dep} type="button" onClick={() => setRoleFilter(dep)} className={`rounded-full px-3 py-1 text-xs font-semibold ${roleFilter === dep ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{dep}</button>
        ))}
      </div>

      {/* Visual pipeline — connected, color-coded, clickable */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch gap-0">
          {visible.map((p, i) => {
            const pd = DEPT[p.dept];
            const active = p.n === sel;
            const total = p.steps.length;
            const done = p.steps.filter((_, idx) => checks[`${p.n}:${idx}`]).length;
            const complete = done === total && total > 0;
            return (
              <div key={p.n} className="flex items-stretch">
                <button type="button" onClick={() => setSel(p.n)}
                  className={`flex w-[150px] flex-col gap-1 rounded-xl border p-2.5 text-left transition ${active ? `ring-2 ${pd.sel} border-transparent` : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${complete ? "bg-emerald-500" : pd.dot}`}>{complete ? "✓" : p.n}</span>
                    <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${pd.chip}`}>{p.dept}</span>
                  </div>
                  <span className="text-[12px] font-semibold leading-tight text-slate-800">{p.title}</span>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full ${pd.bar}`} style={{ width: total ? `${(done / total) * 100}%` : "0%" }} />
                  </div>
                </button>
                {i < visible.length - 1 && <div className="flex items-center px-1 text-slate-300">→</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail — A→Z + interactive SOP checklist + AI */}
      <div className={`rounded-2xl border p-5 ring-1 ${d.sel} ring-transparent`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold text-white ${d.dot}`}>{phase.n}</span>
          <h3 className="text-lg font-bold text-slate-900">{phase.title}</h3>
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${d.chip}`}>{phase.dept}</span>
          <span className="ml-auto text-xs font-medium text-slate-500">Owner: {phase.owner}</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">{phase.summary}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* SOP checklist */}
          <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">SOP checklist</div>
              <span className="text-[11px] font-semibold text-slate-400">{doneCount}/{phase.steps.length}</span>
            </div>
            <ul className="space-y-1.5">
              {phase.steps.map((s, i) => {
                const key = `${phase.n}:${i}`;
                const on = !!checks[key];
                return (
                  <li key={i}>
                    <button type="button" onClick={() => toggle(key)} className="flex w-full items-start gap-2 text-left">
                      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${on ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"}`}>{on ? "✓" : ""}</span>
                      <span className={`text-sm ${on ? "text-slate-400 line-through" : "text-slate-700"}`}>{s}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {phase.branches && (
              <div className="mt-3 border-t border-slate-100 pt-2">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Outcomes</div>
                <div className="flex flex-wrap gap-1.5">{phase.branches.map((b, i) => <span key={i} className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{b}</span>)}</div>
              </div>
            )}
            <p className="mt-2 text-[10px] text-slate-400">This checklist is the working SOP for {phase.owner}. Your checks save on this device.</p>
          </div>

          {/* AI */}
          <div className="space-y-3">
            <div className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200">
              <div className="mb-1 text-xs font-bold text-slate-700">💡 AI assists the team</div>
              <ul className="space-y-1 text-sm text-slate-600">{phase.aiAssist.map((a, i) => <li key={i} className="flex gap-2"><span>•</span><span>{a}</span></li>)}</ul>
            </div>
            <div className="rounded-xl bg-brand-navy p-3">
              <div className="mb-1 text-xs font-bold text-brand-gold-soft">🤖 AI can run this (repeatable)</div>
              <ul className="space-y-1 text-sm text-brand-navy-100">{phase.aiAuto.map((a, i) => <li key={i} className="flex gap-2"><span className="text-brand-gold-soft">›</span><span>{a}</span></li>)}</ul>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button type="button" disabled={sel === 1} onClick={() => setSel((n) => Math.max(1, n - 1))} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-brand-navy disabled:opacity-30">← Previous</button>
          <span className="text-xs text-slate-400">Phase {phase.n} of {PHASES.length}</span>
          <button type="button" disabled={sel === PHASES.length} onClick={() => setSel((n) => Math.min(PHASES.length, n + 1))} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-brand-navy disabled:opacity-30">Next →</button>
        </div>
      </div>
    </div>
  );
}
