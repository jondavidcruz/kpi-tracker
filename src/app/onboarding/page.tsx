import Link from "next/link";
import { getCurrentUser, isManager, isOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import { PROFILES, FACTORS, type DiscScore } from "@/lib/assessment";
import CopyLink from "@/components/CopyLink";
import { createAssessmentInvite, deleteAssessment, setUserOnboarding } from "@/app/actions";

export const dynamic = "force-dynamic";

const ROLES = [
  { icon: "🎯", name: "Junior Acquisitions", blurb: "Takes the appointments, runs discovery → offer → negotiation, and gets contracts signed. The closer-in-training.", comp: "Commission-only (% of the assignment fee on deals they sign)." },
  { icon: "🤝", name: "Junior Dispositions", blurb: "Sources developer/builder cash buyers, captures their buy boxes, and moves deals to the right buyer fast. The dispo-rep-in-training.", comp: "Commission-only (% of the assignment fee on deals they help move)." },
];

// Phase-0 bootcamp + go-live gates, per hire track. Acquisitions talk to SELLERS;
// Dispositions source BUYERS (developers/builders) and run the buy-box play.
const TRACKS: { role: string; bootcamp: { task: string; href?: string; label?: string }[]; gates: string[] }[] = [
  {
    role: "🎯 Junior Acquisitions",
    bootcamp: [
      { task: "Watch EVERY training video in the portal + take notes on each", href: "/training", label: "Video Library" },
      { task: "Learn the language — every key term", href: "/glossary", label: "Glossary" },
      { task: "Memorize the seller call scripts (word-for-word)", href: "/scripts", label: "Scripts" },
      { task: "Understand the deal flow start to finish", href: "/process", label: "Process Map" },
      { task: "Learn the basic deal math (ARV, MAO, novation)", href: "/underwriting", label: "Underwriting" },
    ],
    gates: [
      "Glossary check — can define ARV, MAO, novation, assignment, motivated seller, etc.",
      "Script certification — records themselves role-playing each seller script; manager scores + ⭐-rates it in Call Scoring.",
      "Process walkthrough — can explain the full deal lifecycle out loud.",
    ],
  },
  {
    role: "🤝 Junior Dispositions",
    bootcamp: [
      { task: "Work the Developer Sourcing Track — all 5 modules", href: "/training", label: "Training Portal" },
      { task: "Learn the language — key terms + the Lux Blueprint", href: "/glossary", label: "Glossary" },
      { task: "Memorize the buyer / developer + agent-sourcing scripts", href: "/scripts", label: "Scripts" },
      { task: "Learn the Buyer Research tool — every buy-box field", href: "/vetting", label: "Buyer Research" },
      { task: "Understand the dispositions deal flow start to finish", href: "/process", label: "Process Map" },
    ],
    gates: [
      "Buy-box check — can name every field of a complete developer buy box and why each matters.",
      "Gatekeeper + buy-box certification — records a role-play reaching a decision-maker and capturing a full buy box; manager ⭐-rates it in Call Scoring.",
      "Tool proof — captured one real, complete buy box in Buyer Research (zero blank fields) with a follow-up date set.",
    ],
  },
];

const PLAN: { role: string; rows: [string, string, string][] }[] = [
  {
    role: "🎯 Junior Acquisitions",
    rows: [
      ["Day 30", "Certified on all AQ scripts; handling discovery calls; first offers made.", "Call scores above threshold; offers going out."],
      ["Day 60", "Running offer + negotiation calls solo; first contract signed.", "≥ 1 signed contract + call quality holding."],
      ["Day 90", "Owns a pipeline; consistent contract flow.", "Deals signed/closed → graduate to Acquisitions."],
    ],
  },
  {
    role: "🤝 Junior Dispositions",
    rows: [
      ["Day 30", "Certified on the buyer/developer scripts; sourcing + adding new developers daily; first buy boxes captured.", "New Buyers Added + Buy Boxes Captured trending up; gatekeeper cert passed."],
      ["Day 60", "Capturing complete buy boxes solo; pitching live deals to matched buyers.", "≥ 1 deal sent to a matched buyer; buy boxes complete (no blank fields)."],
      ["Day 90", "Owns a buyer book; consistently matches + moves deals.", "Assisted on a closed assignment → graduate to Dispositions."],
    ],
  },
];

const MECHANICS = [
  ["Daily", "KPI entry + the Daily Huddle stand-up."],
  ["Weekly", "1-on-1 in the Training Portal (focus skills + coaching log)."],
  ["Calls", "A set # reviewed each week in Call Scoring — ⭐-rated and marked “used for training.”"],
  ["The gates are pass/fail", "Commission-only means a non-performer self-selects out fast, protecting your time."],
];

function DiscBars({ disc }: { disc: DiscScore }) {
  return (
    <div className="mt-2 space-y-1">
      {FACTORS.map((f) => (
        <div key={f.key} className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-[11px] font-semibold text-slate-500">{f.name}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${disc[f.key]}%`, background: f.color }} />
          </div>
          <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-slate-500">{disc[f.key]}</span>
        </div>
      ))}
    </div>
  );
}

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

  const owner = isOwner(me);
  const assessments = owner ? await db.assessment.findMany({ orderBy: { createdAt: "desc" } }) : [];
  const team = owner ? await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, onboarding: true } }) : [];
  const mapped = new Set(assessments.map((a) => a.name.trim().toLowerCase()));
  const unmapped = team.filter((u) => !mapped.has(u.name.trim().toLowerCase()));
  // Only non-manager, non-owner staff can be put in the restricted onboarding ramp.
  const restrictable = team.filter((u) => u.role !== "manager" && u.role !== "admin" && u.name.trim().split(/\s+/)[0].toLowerCase() !== "jon");

  return (
    <div className="space-y-6">
      <SectionTitle title="🎓 Onboarding — New Talent" subtitle="How we ramp a new commission-only hire: front-load the learning, gate hard, let the 30/60/90 plan prove them out." accent="bg-brand-gold" />

      <Card className="border-l-4 border-brand-gold bg-amber-50/50 p-4 text-sm text-slate-700">
        <b>The philosophy:</b> commission-only means we can&apos;t afford a slow ramp — but we also shouldn&apos;t spend our time training someone who won&apos;t make it. So we <b>front-load the learning, gate hard before they go live, and let the 30/60/90 self-select.</b> The faster they master the material, the faster they earn — that&apos;s the pitch.
      </Card>

      {owner && (
        <Card id="assessments" className="p-5">
          <SectionTitle title="🧭 Behavioral Assessments" subtitle="Our in-house DISC profile. Send a link, they take two short tests, you get their strengths + best-fit seat. Results are owner-only." accent="bg-violet-500" />

          <form action={createAssessmentInvite} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
            <label className="text-xs"><span className="mb-0.5 block font-semibold text-slate-500">Name</span><input name="name" required placeholder="Candidate / team member" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
            <label className="text-xs"><span className="mb-0.5 block font-semibold text-slate-500">Email (optional)</span><input name="email" type="email" placeholder="name@email.com" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
            <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">+ Create link</button>
          </form>

          {unmapped.length > 0 && (
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
              <div className="mb-1.5 text-[12px] font-semibold text-violet-800">Map the current team — one click each generates their link:</div>
              <div className="flex flex-wrap gap-1.5">
                {unmapped.map((u) => (
                  <form key={u.id} action={createAssessmentInvite}>
                    <input type="hidden" name="name" value={u.name} />
                    <input type="hidden" name="userId" value={u.id} />
                    <button className="rounded-lg bg-white px-2.5 py-1 text-[12px] font-semibold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100">+ {u.name.split(" ")[0]}</button>
                  </form>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {assessments.length === 0 && <p className="text-sm text-slate-400">No assessments yet. Create a link above and send it to a candidate or teammate.</p>}
            {assessments.map((a) => {
              const work = a.workStylesResult ? JSON.parse(a.workStylesResult) : null;
              const word = a.wordSurveyResult ? JSON.parse(a.wordSurveyResult) : null;
              const profile = PROFILES[a.profileKey] ?? null;
              const disc: DiscScore | null = work?.disc ?? word?.disc ?? null;
              return (
                <div key={a.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-800">{a.name}</span>
                    {profile ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">{profile.emoji} {profile.name}</span>
                      : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">⏳ pending</span>}
                    <span className="text-[11px] text-slate-400">{a.workStylesResult ? "How You Work Best ✓" : "How You Work Best –"} · {a.wordSurveyResult ? "Quick Word Pick ✓" : "Quick Word Pick –"}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <CopyLink path={`/assess/${a.token}`} />
                      <form action={deleteAssessment}><input type="hidden" name="id" value={a.id} /><button className="text-[11px] text-slate-300 hover:text-red-600">remove</button></form>
                    </span>
                  </div>
                  {disc && <DiscBars disc={disc} />}
                  {profile && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="text-[13px] text-slate-600"><b>{profile.blurb}</b><div className="mt-1"><span className="font-semibold text-slate-500">Strengths:</span> {profile.strengths.join(" · ")}</div><div className="mt-0.5"><span className="font-semibold text-slate-500">Watch-outs:</span> {profile.watchouts.join(" · ")}</div></div>
                      <div className="text-[13px] text-slate-600"><div><span className="font-semibold text-slate-500">💬 Communicate:</span> {profile.comms}</div><div className="mt-0.5"><span className="font-semibold text-slate-500">🔥 Motivate:</span> {profile.motivate}</div><div className="mt-0.5"><span className="font-semibold text-slate-500">🎯 Best seat:</span> {profile.seat}</div></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Our own DISC-based instrument — inspired by the Predictive Index &amp; McQuaig approach, built in-house so it&apos;s ours to use freely. Not affiliated with either company.</p>
        </Card>
      )}

      {owner && restrictable.length > 0 && (
        <Card className="p-5">
          <SectionTitle title="🚦 Access & Certification" subtitle="New hires stay restricted to learning + the daily basics until you certify them. Certifying grants full role-based access to the rest of the War Room." accent="bg-emerald-500" />
          <div className="mt-3 space-y-2">
            {restrictable.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
                <span className="font-semibold text-slate-800">{u.name}</span>
                {u.onboarding
                  ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">🔒 Onboarding — restricted</span>
                  : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">✅ Certified — full access</span>}
                <form action={setUserOnboarding} className="ml-auto">
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="onboarding" value={u.onboarding ? "0" : "1"} />
                  {u.onboarding
                    ? <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">✅ Certify — grant full access</button>
                    : <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">🔒 Move to onboarding</button>}
                </form>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">While in onboarding, they only see: Dashboard, Schedule &amp; Time, Enter KPIs, Daily Huddle, Training Portal, Glossary, Scripts, Process Map, Underwriting, Call Scoring. Everything else is hidden until you certify them.</div>
        </Card>
      )}

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

      {/* Phase 0 — Bootcamp (per track) */}
      <Card className="p-5">
        <SectionTitle title="Phase 0 — Pre-Start Bootcamp" subtitle="A 1–2 week self-study block before they touch a live lead (~2–3 hrs/day). Pick the hire's track." accent="bg-sky-400" />
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {TRACKS.map((t) => (
            <div key={t.role} className="rounded-xl ring-1 ring-slate-200">
              <div className="rounded-t-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">{t.role}</div>
              <div className="space-y-2 p-3">
                {t.bootcamp.map((b) => (
                  <div key={b.task} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                    <span className="text-slate-300">☐</span>
                    <span className="flex-1 text-slate-700">{b.task}</span>
                    {b.href && <Link href={b.href} className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-gold/50">{b.label} →</Link>}
                  </div>
                ))}
                <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-red-700">🚧 Gates to go live</div>
                  <ul className="mt-1 space-y-1">
                    {t.gates.map((g, i) => <li key={i} className="text-[13px] text-slate-700">✅ {g}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Phase 1 */}
      <Card className="p-5">
        <SectionTitle title="Phase 1 — Shadow + Ramp" subtitle="First ~2 weeks live." accent="bg-emerald-400" />
        <ul className="space-y-1 text-[13px] text-slate-700">
          <li>• Listen to recorded calls in <Link href="/call-scoring" className="underline">Call Scoring</Link>; sit in on live calls.</li>
          <li>• Junior AQ: start on aged / warm follow-ups (low stakes), shadow live acquisitions calls, then run discovery solo.</li>
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
        <p className="mt-1">Commission-only + California is a worker-classification minefield (AB5 / ABC test). A 1099 commission-only acquisitions / sales role can be risky in CA, and the real-estate-licensee carve-out may or may not apply. <b>Confirm W-2-vs-1099 and the comp structure with an employment attorney before hiring</b> — especially in CA. Also train every dialer on <b>TCPA / Do-Not-Call</b> rules for outbound.</p>
      </Card>

      <p className="text-center text-[11px] text-slate-400">Reference playbook. Next up (on request): a per-hire interactive tracker — assign a new hire and check off their Bootcamp + 30/60/90 progress.</p>
    </div>
  );
}
