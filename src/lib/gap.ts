// Gap analysis: how far behind a KPI is, and what it takes to close the gap.
import { daysInMonth, dayOfMonth } from "./date";
import { formatValue, type Unit } from "./format";

export interface DailyGap {
  short: number; // how many units below goal (always > 0)
  goal: number;
  value: number;
}

/** Daily shortfall vs goal. Returns null if on/above goal or untracked. */
export function dailyGap(
  goalKind: string,
  value: number,
  goal: number | null,
): DailyGap | null {
  if (goal === null || goalKind === "tracked") return null;
  if (goalKind === "at_most") {
    const over = value - goal;
    return over > 0 ? { short: over, goal, value } : null;
  }
  const short = goal - value;
  return short > 0 ? { short, goal, value } : null;
}

export interface MonthlyGap {
  expected: number; // expected month-to-date by pace
  mtd: number;
  behindPace: number; // expected - mtd (> 0)
  remaining: number; // goal - mtd
  daysLeft: number; // calendar days left in month
  perDay: number; // remaining / daysLeft
}

/** Month-to-date pace gap + what's needed per day to still hit the goal. */
export function monthlyGap(
  date: string,
  goalKind: string,
  mtd: number,
  goal: number | null,
): MonthlyGap | null {
  if (goal === null || goalKind === "tracked" || goalKind === "at_most") return null;
  const dim = daysInMonth(date);
  const dom = dayOfMonth(date);
  const expected = goal * (dom / dim);
  const behindPace = expected - mtd;
  if (behindPace <= 0) return null; // on or ahead of pace
  const remaining = Math.max(0, goal - mtd);
  const daysLeft = Math.max(1, dim - dom);
  return { expected, mtd, behindPace, remaining, daysLeft, perDay: remaining / daysLeft };
}

/** Human "how to close it" line for a daily gap. */
export function dailyCatchup(unit: Unit, g: DailyGap): string {
  return `${formatValue(unit, g.short)} short of the ${formatValue(unit, g.goal)} goal.`;
}

/** Human "how to close it" line for a monthly gap. */
export function monthlyCatchup(unit: Unit, g: MonthlyGap): string {
  return `Behind pace by ${formatValue(unit, g.behindPace)} — need ${formatValue(
    unit,
    g.remaining,
  )} more in ${g.daysLeft} day${g.daysLeft === 1 ? "" : "s"} (~${formatValue(
    unit,
    Math.ceil(g.perDay),
  )}/day).`;
}

// --- Coaching: per-KPI gap diagnosis + a short training plan ----------------
// Keyed by KPI `key`. Each entry explains the LIKELY cause of a shortfall and a
// concrete fix, so an alert isn't just "you're behind" — it's "here's how to
// close it." Severity of the gap (how far behind) tunes the tone in buildCoaching().

interface Coaching {
  diagnose: string; // the likely reason the number is low
  fix: string[]; // 2-3 concrete, do-it-now actions
}

const COACHING: Record<string, Coaching> = {
  outbound_calls: {
    diagnose: "Dial volume is the top of the funnel — low dials means everything downstream dries up.",
    fix: [
      "Power-dial in 50-min blocks, no manual dialing between calls.",
      "Pre-load the next call list the night before so there's no morning ramp-up.",
      "Check the dialer/connection isn't dropping — log any downtime.",
    ],
  },
  connected_calls: {
    diagnose: "Dials are happening but few are reaching a live person — likely list quality or call timing.",
    fix: [
      "Shift dialing to peak pickup windows (late morning, early evening local to the lead).",
      "Scrub dead/wrong numbers out of the list daily.",
      "Verify caller ID isn't being flagged as spam.",
    ],
  },
  quality_convos: {
    diagnose: "Reaching people but not getting real selling conversations — usually an opener/rapport gap.",
    fix: [
      "Lead with a pattern-interrupt opener, not a pitch.",
      "Ask 2 discovery questions before mentioning an offer.",
      "Review a recording of your best convo this week and mirror it.",
    ],
  },
  leads_generated: {
    diagnose: "Conversations aren't converting into qualified leads — likely weak qualifying or follow-up.",
    fix: [
      "Use the full qualifying script (motivation, timeline, price, condition).",
      "Book the next step on the call — don't leave it open.",
      "Tag warm-but-not-ready leads for a same-week callback.",
    ],
  },
  leads_cc: {
    diagnose: "Cold-call lead output is low — tied to dials × connection × qualifying.",
    fix: [
      "Hit the dial goal first; leads follow volume.",
      "Tighten the qualifying questions so good leads aren't slipping past.",
    ],
  },
  appts_set: {
    diagnose: "Not enough appointments booked from the leads worked — usually a closing-for-the-appointment gap.",
    fix: [
      "Always ask for the appointment with a specific day/time (assumptive close).",
      "Handle the 'just send info' brush-off with a reason to meet instead.",
      "Confirm appts same-day to cut no-shows feeding the next stage.",
    ],
  },
  passoffs: {
    diagnose: "Few live transfers/handoffs to Acquisitions — qualified leads aren't being moved over fast enough.",
    fix: [
      "Warm-transfer on the call while interest is hot, don't queue it.",
      "If acquisitions is busy, book the appointment then and there.",
    ],
  },
  appts_taken: {
    diagnose: "Set appointments aren't being taken/showing — a confirmation and pre-frame problem.",
    fix: [
      "Confirm every appt the morning of with a value reminder.",
      "Pre-frame what the seller should expect so they keep it.",
      "Reschedule no-shows immediately, don't let them go cold.",
    ],
  },
  offers_made: {
    diagnose: "Appointments aren't turning into offers — likely incomplete deal analysis or hesitation to present.",
    fix: [
      "Come to every appt with comps + a number ready to present.",
      "Present an offer on the first appt whenever the data allows.",
      "Use a range to start the conversation rather than waiting for 'perfect' info.",
    ],
  },
  acq_talk_time: {
    diagnose: "Low talk time with sellers — not enough live seller conversations or calls too short.",
    fix: [
      "Block dedicated seller-callback time daily.",
      "Slow down on calls — discovery, not transactions.",
    ],
  },
  cc_talk_time: {
    diagnose: "Low phone time — usually gaps between calls or short conversations.",
    fix: [
      "Tighten between-call downtime; keep the dialer moving.",
      "Extend good conversations with more discovery questions.",
    ],
  },
  buyers_contacted: {
    diagnose: "Buyer outreach volume is low — the buyer list isn't being worked hard enough.",
    fix: [
      "Set a daily buyer-touch block and protect it.",
      "Work the list by buy-box match so outreach is relevant.",
      "Mix channels (call + text + email) to lift contact rate.",
    ],
  },
  new_buyers: {
    diagnose: "Few new qualified buyers added — pipeline of cash buyers is stagnating.",
    fix: [
      "Pull new buyers from recent cash sales / public records weekly.",
      "Qualify buy-box + proof of funds before adding.",
      "Ask every active buyer for a referral.",
    ],
  },
  buyer_offers_received: {
    diagnose: "Few offers coming back — buyers aren't biting, usually price or property fit.",
    fix: [
      "Re-check the asking price against recent comps.",
      "Follow up with buyers who opened but didn't offer.",
    ],
  },
  // key is still "deals_sold" but now means "Deals Sent to Buyers".
  deals_sold: {
    diagnose: "Deals aren't being sent to enough buyers — narrow distribution slows offers.",
    fix: [
      "Blast every new contract to the full matched buyer list within 24h.",
      "Widen the buyer match (adjacent buy-boxes) when interest is thin.",
      "Send to a backup buyer pool too, not just the obvious matches.",
    ],
  },
  contracts_assigned: {
    diagnose: "Deals aren't getting assigned/closed — buyer-match or pricing/marketing speed.",
    fix: [
      "Lock a backup buyer on every deal so a fallout doesn't kill it.",
      "Re-price or re-market anything sitting >7 days.",
    ],
  },
  contracts_sent: {
    diagnose: "Contract volume is behind pace — upstream offers or follow-up are lagging.",
    fix: [
      "Send the contract same-day when a seller verbally agrees.",
      "Follow up on outstanding offers daily until yes/no.",
    ],
  },
  contracts_signed: {
    diagnose: "Sent contracts aren't getting signed — a follow-through and objection-handling gap.",
    fix: [
      "Walk the seller through signing live (screen-share / e-sign on the call).",
      "Follow up within hours, not days, on unsigned contracts.",
    ],
  },
  internet_speed: {
    diagnose: "Internet is below the minimum to work reliably — calls drop, dialer lags, CRM stalls.",
    fix: [
      "Restart the router/modem, then run a fresh speed test.",
      "Move closer to the router or switch to a wired/ethernet connection.",
      "If it stays low, switch to a mobile hotspot and flag a manager — log any outage.",
    ],
  },
};

const GENERIC: Coaching = {
  diagnose: "This metric is below target for the day.",
  fix: ["Review what blocked the number today.", "Set a specific catch-up target for tomorrow."],
};

/**
 * Build a full coaching block for an alert: gap line + likely cause + a short
 * training plan. `tone` scales with how far behind they are.
 */
export function buildCoaching(opts: {
  kpiKey: string;
  kpiName: string;
  unit: Unit;
  gap: DailyGap | MonthlyGap;
  who: string | null;
}): { headline: string; diagnose: string; plan: string[] } {
  const c = COACHING[opts.kpiKey] ?? GENERIC;
  const isDaily = "short" in opts.gap;
  const headline = isDaily
    ? dailyCatchup(opts.unit, opts.gap as DailyGap)
    : monthlyCatchup(opts.unit, opts.gap as MonthlyGap);
  return { headline, diagnose: c.diagnose, plan: c.fix };
}

/** One-line plain-text version for Chat. */
export function coachingText(c: { headline: string; diagnose: string; plan: string[] }): string {
  return `${c.headline}\n   _Why:_ ${c.diagnose}\n   _Fix:_ ${c.plan.map((p) => "• " + p).join("  ")}`;
}
