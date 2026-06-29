import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROLES = [
  { icon: "📞", name: "Lead Qualifier / Appointment Setter", blurb: "Front of the funnel — works leads, qualifies motivation + timeline, and books appointments for acquisitions. The feeder role.", comp: "Commission-only (per qualified appt set / per deal closed from their appointments)." },
  { icon: "🎯", name: "Junior Acquisitions", blurb: "Takes the appointments, runs discovery → offer → negotiation, and gets contracts signed. The closer-in-training.", comp: "Commission-only (% of the assignment fee on deals they sign)." },
];

const BOOTCAMP: { task: string; href?: string; label?: string }[] = [
  { task: "Watch all training videos", href: "/training", label: "Training Portal" },
  { task: "Learn the language — every key term", href: "/glossary", label: "Glossary" },
  { task: "Memorize the call scripts (word-for-word)", href: "/scripts", label: "Scripts" },
  { task: "Understand the deal flow start to finish", href: "/process", label: "Process Map" },
  { task: "Learn the basic deal math (ARV, MAO, novation)", href: "/underwriting", label: "Underwriting" },
];

const GATES = [
  "Glossary check — can define ARV, MAO, novation, assignment, motivated seller, etc.",
  "Script certification — records themselves role-playing each script; manager scores + ⭐-rates it in Call Scoring.",
  "Process walkthrough — can explain the full deal lifecycle out loud.",
];

const PLAN: { role: string; rows: [string, string, string][] }[] = [
  {
    role: "📞 Lead Qualifier / Appointment Setter",
    rows: [
      ["Day 30", "Scripts cold, ramped on dials, first qualified appointments set.", "Hitting ~70% of dial + conversation targets."],
      ["Day 60", "Consistent appointment volume; appointments show + are qualified.", "A set # of qualified appts / week."],
      ["Day 90", "Predictable appt flow feeding AQ; first deals close from their appts.", "Sustained quota → keep the seat / promotion track."],
    ],
  },
  {
    role: "🎯 Junior Acquisitions",
    rows: [
      ["Day 30", "Certified on all AQ scripts; handling discovery calls; first offers made.", "Call scores above threshold; offers going out."],
      ["Day 60", "Running offer + negotiation calls solo; first contract signed.", "≥ 1 signed contract + call quality holding."],
      ["Day 90", "Owns a pipeline; consistent contract flow.", "Deals signed/closed → graduate to Acquisitions."],
    ],
  },
];

const MECHANICS = [
  ["Daily", "KPI entry + the Daily Huddle stand-up."],
  ["Weekly", "1-on-1 in the Training Portal (focus skills + coaching log)."],
  ["Calls", "A set # reviewed each week in Call Scoring — ⭐-rated and marked “used for training.”"],
  ["The gates are pass/fail", "Commission-only means a non-performer self-selects out fast, protecting your time."],
];

export default async function OnboardingPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle title="🎓 Onboarding — New Talent" subtitle="How we ramp a new commission-only hire: front-load the learning, gate hard, let the 30/60/90 plan prove them out." accent="bg-brand-gold" />

      <Card className="border-l-4 border-brand-gold bg-amber-50/50 p-4 text-sm text-slate-700">
        <b>The philosophy:</b> commission-only means we can&apos;t afford a slow ramp — but we also shouldn&apos;t spend our time training someone who won&apos;t make it. So we <b>front-load the learning, gate hard before they go live, and let the 30/60/90 self-select.</b> The faster they master the material, the faster they earn — that&apos;s the pitch.
      </Card>

      {/* Roles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ROLES.map((r) => (
          <Card key={r.name} className="p-4">
            <div className="text-sm font-bold text-slate-800">{r.icon} {r.name}</div>
            <p className="mt-1 text-[13px] text-slate-600">{r.blurb}</p>
            <p className="mt-1.5 text-[11px] font-semibold text-emerald-700">💵 {r.comp}</p>
          </Card>
        ))}
      </div>

      {/* Phase 0 — Bootcamp */}
      <Card className="p-5">
        <SectionTitle title="Phase 0 — Pre-Start Bootcamp" subtitle="A 1–2 week self-study block before they touch a live lead (~2–3 hrs/day)." accent="bg-sky-400" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BOOTCAMP.map((b) => (
            <div key={b.task} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
              <span className="text-slate-300">☐</span>
              <span className="flex-1 text-slate-700">{b.task}</span>
              {b.href && <Link href={b.href} className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-gold/50">{b.label} →</Link>}
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
          <div className="text-[11px] font-bold uppercase tracking-wide text-red-700">🚧 Gates to go live — don&apos;t skip these</div>
          <ul className="mt-1 space-y-1">
            {GATES.map((g, i) => <li key={i} className="text-[13px] text-slate-700">✅ {g}</li>)}
          </ul>
        </div>
      </Card>

      {/* Phase 1 */}
      <Card className="p-5">
        <SectionTitle title="Phase 1 — Shadow + Ramp" subtitle="First ~2 weeks live." accent="bg-emerald-400" />
        <ul className="space-y-1 text-[13px] text-slate-700">
          <li>• Listen to recorded calls in <Link href="/call-scoring" className="underline">Call Scoring</Link>; sit in on live calls.</li>
          <li>• Lead Qualifier: start dialing aged / warm leads (low stakes) → graduate to fresh.</li>
          <li>• Junior AQ: shadow acquisitions calls, handle follow-ups first, then run discovery solo.</li>
          <li>• Manager scores 2–3 of their calls/day and sets weekly focus skills in the <Link href="/training" className="underline">Training Portal</Link>.</li>
        </ul>
      </Card>

      {/* 30/60/90 */}
      <Card className="p-5">
        <SectionTitle title="The 30 / 60 / 90 Accountability Plan" accent="bg-brand-navy" />
        <div className="space-y-4">
          {PLAN.map((p) => (
            <div key={p.role}>
              <div className="mb-1.5 text-sm font-bold text-slate-700">{p.role}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400"><th className="py-1 pr-3">When</th><th className="px-3 py-1">Milestone</th><th className="px-3 py-1">Gate to advance</th></tr></thead>
                  <tbody>
                    {p.rows.map(([when, milestone, gate]) => (
                      <tr key={when} className="border-t border-slate-100 align-top">
                        <td className="py-2 pr-3 font-bold text-brand-navy">{when}</td>
                        <td className="px-3 py-2 text-slate-700">{milestone}</td>
                        <td className="px-3 py-2 text-slate-500">{gate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Mechanics */}
      <Card className="p-5">
        <SectionTitle title="Accountability mechanics" subtitle="All tie to tools already in the War Room." accent="bg-violet-400" />
        <div className="space-y-1.5">
          {MECHANICS.map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-x-2 text-[13px]"><span className="font-bold text-slate-700">{k}:</span><span className="text-slate-600">{v}</span></div>
          ))}
        </div>
      </Card>

      {/* Legal flag */}
      <Card className="border-l-4 border-red-400 bg-red-50/50 p-4 text-[13px] text-slate-700">
        <div className="font-bold text-red-800">⚠️ Verify before hiring (not legal advice)</div>
        <p className="mt-1">Commission-only + California is a worker-classification minefield (AB5 / ABC test). A 1099 commission-only appointment-setter / cold-caller role can be risky in CA, and the real-estate-licensee carve-out may or may not apply. <b>Confirm W-2-vs-1099 and the comp structure with an employment attorney before hiring</b> — especially in CA. Also train every dialer on <b>TCPA / Do-Not-Call</b> rules for outbound.</p>
      </Card>

      <p className="text-center text-[11px] text-slate-400">Reference playbook. Next up (on request): a per-hire interactive tracker — assign a new hire and check off their Bootcamp + 30/60/90 progress.</p>
    </div>
  );
}
