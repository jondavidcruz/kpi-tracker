// Performance Improvement Plan logic: detect chronic KPI misses and define the
// progressive accountability ladder. Consequences are intentionally framed to be
// defensible (commission/bonus, catch-up time) rather than base-pay docking.
import { db } from "./db";
import { getActiveReps, getKpis, resolveGoalWith, getAllTargets } from "./data";
import { datesInRange } from "./date";
import { statusVsGoal } from "./kpi";
import { buildCoaching, dailyGap } from "./gap";
import { type Unit } from "./format";

export const PIP_CONSECUTIVE_MISSES = 4; // working days in a row below goal -> flag

// The progressive ladder — supportive, growth-framed language. Each stage names
// the support offered + the next step if targets aren't met.
export const PIP_STAGES = [
  {
    key: "coaching",
    label: "Stage 1: Check-in and Support",
    blurb: "A supportive conversation to understand what's getting in the way, plus a clear target and the help to hit it.",
    consequence: "Focus is on support. We'll set a target together and revisit in a few days.",
  },
  {
    key: "pip",
    label: "Stage 2: Improvement Plan",
    blurb: "A written plan with daily targets and regular check-ins so progress is clear and momentum builds.",
    consequence: "We'll add a short catch-up session (such as Saturday hours) to rebuild momentum on missed days.",
  },
  {
    key: "final",
    label: "Stage 3: Final Review",
    blurb: "A defined review window to get back on track, with extra support available.",
    consequence: "Commission and bonus pause until targets are met. If results don't improve, we'll discuss next steps for the role.",
  },
  {
    key: "closed",
    label: "Closed",
    blurb: "Back on track, or a role change or separation was decided.",
    consequence: "None",
  },
];

export function nextStage(stage: string): string {
  const i = PIP_STAGES.findIndex((s) => s.key === stage);
  return i >= 0 && i < PIP_STAGES.length - 1 ? PIP_STAGES[i + 1].key : "closed";
}

export function stageMeta(key: string) {
  return PIP_STAGES.find((s) => s.key === key) ?? PIP_STAGES[0];
}

export interface PipCandidate {
  userId: string;
  userName: string;
  kpiKey: string;
  kpiName: string;
  unit: Unit;
  goal: number;
  missedDates: string[]; // the consecutive miss streak
  coaching: { headline: string; diagnose: string; plan: string[] };
}

/**
 * Find reps with PIP_CONSECUTIVE_MISSES consecutive WORKING-DAY misses (below goal)
 * on a goal-bearing KPI, ending on `endDate`. Only counts days they actually logged
 * (a missing entry isn't a "miss" here — that's handled by missing-entry alerts).
 */
export async function findPipCandidates(endDate: string): Promise<PipCandidate[]> {
  const [reps, perRep, targets] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false, cadence: "daily" }),
    getAllTargets(),
  ]);
  const month = endDate.slice(0, 7);

  // Last ~3 weeks of working days up to endDate.
  const start = shiftDays(endDate, -20);
  const allDays = datesInRange(start, endDate).filter((d) => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    return dow >= 1 && dow <= 5;
  });
  const recent = allDays.slice(-PIP_CONSECUTIVE_MISSES); // the streak window

  const entries = await db.entry.findMany({
    where: { date: { gte: start, lte: endDate }, userId: { not: null } },
  });
  const val = new Map<string, number>(); // `${userId}|${kpiId}|${date}` -> value
  for (const e of entries) if (e.userId) val.set(`${e.userId}|${e.kpiId}|${e.date}`, e.value);

  const out: PipCandidate[] = [];
  for (const rep of reps) {
    const repKpis = [
      ...perRep.filter((k) => k.roleKey === rep.position),
      ...(rep.tracksInternet ? perRep.filter((k) => k.roleKey === "internet") : []),
    ];
    for (const k of repKpis) {
      const goal = resolveGoalWith(targets, k, rep.id, month);
      if (goal === null || k.goalKind === "tracked") continue;

      // Every day in the streak window must be logged AND a miss.
      let allMiss = true;
      const missed: string[] = [];
      for (const d of recent) {
        const v = val.get(`${rep.id}|${k.id}|${d}`);
        if (v === undefined) { allMiss = false; break; } // not logged → don't PIP on it
        if (statusVsGoal(k.goalKind, v, goal) === "miss") missed.push(d);
        else { allMiss = false; break; }
      }
      if (allMiss && missed.length >= PIP_CONSECUTIVE_MISSES) {
        // Skip if an open PIP already exists for this rep+KPI.
        const existing = await db.pip.findFirst({
          where: { userId: rep.id, kpiKey: k.key, status: "open" },
        });
        if (existing) continue;
        const lastVal = val.get(`${rep.id}|${k.id}|${recent[recent.length - 1]}`) ?? 0;
        const g = dailyGap(k.goalKind, lastVal, goal) ?? { short: goal - lastVal, goal, value: lastVal };
        out.push({
          userId: rep.id,
          userName: rep.name,
          kpiKey: k.key,
          kpiName: k.name,
          unit: k.unit as Unit,
          goal,
          missedDates: missed,
          coaching: buildCoaching({ kpiKey: k.key, kpiName: k.name, unit: k.unit as Unit, gap: g, who: rep.name }),
        });
      }
    }
  }
  return out;
}

function shiftDays(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Build a supportive draft email a manager can review, edit, and send to the rep.
 *  Returns subject + html. NOT auto-sent to the rep — drafted for the manager. */
export function buildPipDraft(opts: {
  repName: string;
  repEmail: string;
  kpiName: string;
  goalNote: string;
  plan: string;
  support: string;
  reviewDate: string;
}): { subject: string; html: string; text: string } {
  const first = opts.repName.split(" ")[0];
  const planLines = opts.plan
    .split("\n")
    .map((l) => l.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);

  const subject = `Quick check-in and a plan to support you on ${opts.kpiName}`;
  const text =
`Hi ${first},

I wanted to check in. I've noticed your ${opts.kpiName} has been below target for a few days, and I want to make sure you have everything you need to turn it around. This is about supporting you, not piling on.

Here's a simple plan to get back on track:
Target: ${opts.goalNote || `consistently hit goal on ${opts.kpiName}`}
${planLines.map((l) => `${l}`).join("\n")}

${opts.support ? `Here's how we'll support you: ${opts.support}\n` : ""}Let's touch base${opts.reviewDate ? ` on ${opts.reviewDate}` : " soon"} to see how it's going. If anything is getting in the way (leads, internet, training, whatever it is), just tell me and we'll sort it out together.

You've got this.

Jon`;

  const html =
`<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;color:#0f172a;line-height:1.5;">
  <p>Hi ${first},</p>
  <p>I wanted to check in. I've noticed your <strong>${opts.kpiName}</strong> has been below target for a few days, and I want to make sure you have everything you need to turn it around. This is about supporting you, not piling on.</p>
  <p><strong>Here's a simple plan to get back on track:</strong></p>
  <ul style="padding-left:20px;">
    <li><strong>Target:</strong> ${opts.goalNote || `consistently hit goal on ${opts.kpiName}`}</li>
    ${planLines.map((l) => `<li>${l}</li>`).join("")}
  </ul>
  ${opts.support ? `<p><strong>Here's how we'll support you:</strong> ${opts.support}</p>` : ""}
  <p>Let's touch base${opts.reviewDate ? ` on <strong>${opts.reviewDate}</strong>` : " soon"} to see how it's going. If anything is getting in the way (leads, internet, training, whatever it is), just tell me and we'll sort it out together.</p>
  <p>You've got this.</p>
  <p>Jon</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">
  <p style="font-size:12px;color:#94a3b8;">Draft for ${opts.repName} (${opts.repEmail}). Review and edit before sending. This was not sent to them.</p>
</div>`;

  return { subject, html, text };
}
