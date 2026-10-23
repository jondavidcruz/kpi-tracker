// 🆕 What's New — the team rollout feed (Jon 2026-10-22). Every time a feature ships,
// it gets an entry here: what it is, who it's for, a short how-to, and where to find
// it. The /whats-new page renders these role-filtered, and a dashboard nudge points
// the team at anything new — so a new system is trained the moment it's set up, not
// whenever someone happens to find it. Pure data + helpers (client-safe).
//
// HOW TO ADD ONE (do this on every ship): prepend an entry with today's date, the
// audience, a 3-6 step how-to, and the "where" link. Newest first.

export type WhatsNewAudience = "all" | "dispo" | "acq" | "leadership";

export type WhatsNewEntry = {
  id: string;            // stable slug
  date: string;          // YYYY-MM-DD shipped
  emoji: string;
  title: string;
  blurb: string;         // one line — what it does + why
  audience: WhatsNewAudience[];
  where?: { label: string; href: string };  // jump straight to it
  steps: string[];       // 3-6 short how-to steps
  playbook?: string;     // optional link to a visual playbook
};

// Newest first. Keep each how-to to a few plain steps the team can follow cold.
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: "buyer-coverage", date: "2026-10-22", emoji: "🗺", title: "Buyer Coverage",
    blurb: "Where we have deals but no buyers (source one) and buyers but no deals (go find those).",
    audience: ["dispo", "leadership", "acq"], where: { label: "Coverage tab", href: "/dispo?tab=coverage" },
    steps: [
      "Open Dispo CRM → 🗺 Coverage.",
      "Start with the red 'Source a buyer for these' list — deals with no matching vetted buyer.",
      "Check the price / acreage / area bands: 🔴 no buyers, 🟡 thin, 🟢 covered, 💤 buyers waiting.",
      "💤 bands tell acquisitions what deals to go get; 🔴 tells dispo what buyer to vet next.",
    ],
    playbook: "Dispo Deal Playbook",
  },
  {
    id: "dispo-command-center", date: "2026-10-22", emoji: "☀️", title: "Dispo Command Center (Today)",
    blurb: "One screen to run your day — follow-ups due, deals needing offers, stale deals, replies, hot buyers.",
    audience: ["dispo"], where: { label: "Today tab", href: "/dispo?tab=today" },
    steps: [
      "Open Dispo CRM → ☀️ Today first thing.",
      "Clear the red: overdue follow-ups and 'not out yet' deals.",
      "Chase offers on the '🎯 out, under 3 offers' list.",
      "Catch '💬 new replies' while they're warm. Click any row to open the deal.",
    ],
    playbook: "Dispo Deal Playbook",
  },
  {
    id: "assignment-contract", date: "2026-10-22", emoji: "📄", title: "Assignment contract + e-sign",
    blurb: "Auto-draft the assignment contract from the deal's numbers, then send for signature.",
    audience: ["dispo"], where: { label: "Open a deal", href: "/dispo?tab=today" },
    steps: [
      "On a deal, open the 📄 Assignment contract panel (under Offers).",
      "Check the pre-filled price + fee, then Generate.",
      "Copy / download / print it, or send for signature (PandaDoc email or text the signing link).",
      "It's a draft for attorney review — nothing sends on its own.",
    ],
    playbook: "Dispo Deal Playbook",
  },
  {
    id: "best-offer-handoff", date: "2026-10-22", emoji: "🤝", title: "Best-offer → seller handoff",
    blurb: "Turns your best buyer offer into the number to present the seller, keeping a spread.",
    audience: ["dispo"], where: { label: "Open a deal", href: "/dispo?tab=today" },
    steps: [
      "Log offers as buyers reply (Offers panel).",
      "The 🤝 box shows your best offer minus a target spread = what to offer the seller, with ROI.",
      "Click 'Hand to seller side' — it logs it and makes a task to present the number.",
    ],
    playbook: "Dispo Deal Playbook",
  },
  {
    id: "buyer-blast", date: "2026-10-22", emoji: "⚡", title: "One-click Deal Blast to buyers",
    blurb: "Fire a deal to your matched buyers through DirectREI's dialer/email/SMS — no rebuilding the list.",
    audience: ["dispo"], where: { label: "Open a land deal", href: "/dispo?tab=today" },
    steps: [
      "On a deal, open 'Matching cash buyers' → Send to buyers.",
      "Verify the packet is loaded + accurate, tick the box.",
      "Click Arm & launch — it blasts the matched buyers and seeds the follow-up tracker.",
      "(Turns on once DirectREI's write API is connected — until then it queues a ready task.)",
    ],
  },
  {
    id: "call-ai-notes", date: "2026-10-22", emoji: "🎯", title: "AI call notes + coaching",
    blurb: "After a call: an AI summary note, empty intake fields pre-filled, and a coaching score for the team.",
    audience: ["acq", "dispo", "leadership"], where: { label: "Call Scoring", href: "/call-scoring" },
    steps: [
      "Make your calls as normal — recordings capture automatically.",
      "After a call: a 📞 AI summary posts to the notes, and blank Home/Land fields get pre-filled (it never overwrites what you wrote).",
      "Every call is scored and lands on Call Scoring for coaching — your name + time show on the recording.",
    ],
  },
];

export function recentCount(days = 10): number {
  const cut = Date.now() - days * 86400000;
  return WHATS_NEW.filter((e) => Date.parse(e.date + "T00:00:00") >= cut).length;
}

export function latestDate(): string {
  return WHATS_NEW[0]?.date ?? "";
}

/** Map a user's position/role to the audiences they should see. */
export function audiencesFor(position?: string | null, isMgr?: boolean): WhatsNewAudience[] {
  const a: WhatsNewAudience[] = ["all"];
  if (isMgr) a.push("leadership", "dispo", "acq");
  if (position === "dispositions") a.push("dispo");
  if (position === "acquisitions" || position === "cc_lm") a.push("acq");
  return a;
}

export function entriesFor(audiences: WhatsNewAudience[]): WhatsNewEntry[] {
  const set = new Set(audiences);
  return WHATS_NEW.filter((e) => e.audience.some((x) => set.has(x)));
}
