import Link from "next/link";

// A taught, step-by-step track that turns a dispo rep into a developer/builder
// buyer-sourcing machine. Pure reference content (no DB) — it assembles the
// scripts (/scripts), the buy-box capture tool (/vetting), and the drills
// (/training) into one curriculum with a clear "done when" gate per module.
// Owner's #1 sub-focus: get the dispo team more developers + complete buy boxes.

type Module = {
  n: number;
  title: string;
  goal: string;
  learn: string[];
  drill?: { name: string; how: string };
  script?: { label: string; href: string };
  gate: string;
};

const MODULES: Module[] = [
  {
    n: 1,
    title: "Know who you're calling",
    goal: "Speak developer, not cold-caller. Know the buyer types before you dial.",
    learn: [
      "Company sizes: Mom & Pop builder (1–3 homes/yr) → Regional developer → National (DR Horton, Lennar) → funds/REITs. Each buys differently.",
      "Land / tear-down value: developers buy for the LOT, not the house. A trashed house on a great lot is a WIN to them — the opposite of a retail buyer.",
      "Their math: they back into a price from finished value minus build cost minus profit. Your job is to hand them a lot that pencils.",
      "Decision-maker vs. gatekeeper: the principal / acquisitions manager signs; the receptionist or agent screens. You want the principal.",
    ],
    script: { label: "Read the Developer buyer script", href: "/scripts" },
    gate: "You can explain, in one breath, why a developer would pay more for a tear-down than a retail flipper would.",
  },
  {
    n: 2,
    title: "Find the developers",
    goal: "Build a list of real, active builders in the target area — not random investors.",
    learn: [
      "Sold comps: pull recent new-construction / heavy-reno sales in the area — the buyer on title is often a developer. Look them up.",
      "Permits: the city permit portal lists who pulled build permits nearby — those are active builders with cash right now.",
      "Agents who sell new construction: they know every builder in the zip. The agent-sourcing scripts get you their buyer list.",
      "LinkedIn / IG: builders post projects. Search '<neighborhood> development / custom homes' and note the principal's name.",
      "Log every one you find in Buyer Research so it's tracked and credited to you.",
    ],
    script: { label: "Agent-sourcing scripts (find builders via agents)", href: "/scripts" },
    drill: { name: "Source 5 in 15 min", how: "Timed: from sold comps + permits, find 5 named developers active in one target neighborhood and add them to Buyer Research." },
    gate: "You added 5+ real, named, active developers for a target area to Buyer Research this week.",
  },
  {
    n: 3,
    title: "Get past the gatekeeper",
    goal: "Reach the decision-maker — credible, specific, never salesy.",
    learn: [
      "Sound like a peer with a deal, not a vendor: 'I've got a tear-down lot in <area> — is <principal> the right person to send it to?'",
      "Name the area and the specifics up front. Vague = screened out. Specific = put through.",
      "If blocked, get the best path: direct cell, email, or 'when's a good time to catch them?' — then log it.",
      "Never leave without a next step and a date.",
    ],
    drill: { name: "Past the gatekeeper", how: "Role-play 5 ways to reach the decision-maker through a receptionist. Track which opener gets you through or gets a direct callback." },
    gate: "You can get the developer/principal on the line (or a direct callback) in a mock call without sounding salesy.",
  },
  {
    n: 4,
    title: "Capture the COMPLETE buy box",
    goal: "One call → every buy-box field filled. This is the whole game.",
    learn: [
      "Fill EVERY field in Buyer Research on the call: target areas/neighborhoods, price range per lot, property type, build type, min lot size, condition tolerance, buying frequency, closing speed, decision-maker, best way to reach them.",
      "A blank field = a deal you can't match later. 'What areas?' 'What's your max per lot?' 'Tear-down OK or does it need to stand?' 'How fast can you close cash?'",
      "Confirm decision-maker + best contact method + when they're buying next.",
      "Set the next follow-up date before you hang up.",
    ],
    script: { label: "Developer buyer script — 'Understand Their Buy Box' step", href: "/scripts" },
    drill: { name: "Buy-box in one call", how: "On a single mock call, fill EVERY buy-box field with nothing left blank. Time it — aim under 8 minutes." },
    gate: "You captured one REAL, complete buy box in Buyer Research — zero blank fields — and set a follow-up date.",
  },
  {
    n: 5,
    title: "Match & pitch a deal to their box",
    goal: "Turn a captured buy box into a closed assignment — fast.",
    learn: [
      "When a deal comes under contract, the Deals board auto-shows which vetted buyers' areas match it (🎯 banner). Start there.",
      "Pitch to THEIR box: address, the numbers, and the one reason it fits what they told you they want. 30 seconds, no wasted words.",
      "More complete buy boxes = more matches = faster dispo. That's why Module 4 matters.",
      "Log the touch so it credits your Developers Contacted KPI and keeps the follow-up alive.",
    ],
    drill: { name: "30-second deal pitch", how: "Pitch a live deal to a buyer in 30 sec: address, numbers, why it fits THEIR box. Cut every wasted word until they ask a follow-up question." },
    gate: "You pitched a live deal to a matched buyer using their own buy-box criteria — and they asked a follow-up question.",
  },
];

export default function DevSourcingTrack() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy-700 p-4 text-white ring-1 ring-brand-navy sm:p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-lg font-extrabold text-brand-gold">🏗️ Developer Sourcing Track</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/80">Dispositions · buyer research</span>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-white/70">
        The dispo team&apos;s #1 job: sign more developers/builders as cash buyers and capture their buy boxes so we
        close deals faster. Work these five modules in order — each ends with a clear &quot;you&apos;ve got it when…&quot; gate.
      </p>

      <div className="space-y-3">
        {MODULES.map((m) => (
          <div key={m.n} className="rounded-xl bg-white p-4 text-slate-800 ring-1 ring-black/5">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-navy text-sm font-extrabold text-white">{m.n}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-slate-800">{m.title}</div>
                <div className="text-[12px] font-medium text-brand-navy">{m.goal}</div>

                <ul className="mt-2 space-y-1">
                  {m.learn.map((l, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-slate-600">
                      <span className="text-brand-gold">•</span><span>{l}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-2 flex flex-wrap gap-2">
                  {m.script && (
                    <Link href={m.script.href} className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100">
                      📄 {m.script.label}
                    </Link>
                  )}
                  {m.drill && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
                      🏋️ Drill: {m.drill.name}
                    </span>
                  )}
                </div>
                {m.drill && <p className="mt-1 text-[11px] italic text-slate-400">{m.drill.how}</p>}

                <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-800 ring-1 ring-emerald-100">
                  ✅ You&apos;ve got it when: {m.gate}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/vetting" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gold px-3.5 py-2 text-[13px] font-bold text-brand-navy hover:brightness-105">
          🔎 Open Buyer Research →
        </Link>
        <Link href="/call-scoring" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-white/20">
          🎧 Record a buy-box role-play & get it scored →
        </Link>
      </div>
      <p className="mt-2 text-[11px] text-white/50">
        Certification: complete all five gates, capture one real buy box in Buyer Research, and pass a scored
        &quot;Developer buy-box call&quot; role-play in Call Scoring.
      </p>
    </div>
  );
}
