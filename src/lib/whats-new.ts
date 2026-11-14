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
    id: "litigator-protocol", date: "2026-11-13", emoji: "⚖️", title: "Litigator Protocol — never contact a flagged lead again",
    blurb: "If anyone threatens to sue us or fishes for our company info, we now auto-flag them, stop ALL automation to them, and keep a permanent legal-defense file — plus you can log a threat made on a call.",
    audience: ["leadership"], where: { label: "Business Heartbeat → Litigator Protocol", href: "/legal-watch" },
    steps: [
      "Automatic: when a seller texts/emails a legal threat (sue, lawsuit, cease-and-desist, TCPA, attorney) OR fishes for our info ('who are you / what LLC'), the lead is flagged and a defense file is captured — when they entered our system, their consent, and every message in & out.",
      "An EXPLICIT threat now auto-opts them out — no drip, appointment text, or automation will ever reach them again. Plain 'who are you' questions are flagged but a human decides the opt-out.",
      "Open /legal-watch (managers only) for the monitoring summary: how many are on file, how many are threats, who's opted out, and who still needs it.",
      "Someone threatened to sue on a CALL? Click ➕ Log a threat manually — enter what they said and check 'Opt them out now'. It's saved to the defense file forever.",
      "Any record not yet opted out shows a 🚫 Opt them out now button — one click stops all automated contact.",
      "Our name, company, website, and phone are already scrubbed from every automated text/email — never share the LLC, address, or licensing with a fishing lead; route them to a manager.",
    ],
  },
  {
    id: "telnyx-eod-spend", date: "2026-11-13", emoji: "💸", title: "Telnyx spend — one end-of-day number",
    blurb: "Instead of spend posting all day, you get ONE clean 'today's shift spend' message after the shift, in the phone-health chat space.",
    audience: ["leadership"], where: { label: "Admin → Telnyx", href: "/admin/telnyx" },
    steps: [
      "Once a day, ~6-7pm PT, a single message posts the day's total Telnyx spend (+ current balance and any auto-recharge) to the phone-health space.",
      "It's idempotent — it posts at most once per day, no more repeated spend pings.",
      "The full burn rate, month-to-date, and recharge cadence still live on Admin → Telnyx and the Comms Guardian page.",
    ],
  },
  {
    id: "markets-sc-pullplan", date: "2026-11-06", emoji: "🎯", title: "South Carolina markets + a 'Tonight's Pull Plan'",
    blurb: "Added 11 South Carolina land markets (Charleston, Greenville, Myrtle Beach, Bluffton/Jasper — the #1 fastest-growing county in the US — and more) and new tools that tell you exactly where to pull next.",
    audience: ["leadership", "acq"], where: { label: "Target Markets → Analysis", href: "/markets" },
    steps: [
      "The map now covers Florida AND South Carolina — 11 new SC markets (Lowcountry, Upstate, Grand Strand, Midlands, Charlotte border) are live with growth-based scores.",
      "📊 Analysis tab now opens with 🎯 Tonight's Pull Plan: the top markets to pull next, ranked by opportunity, each with a ready-to-run DealMachine recipe (county + preset + absentee/out-of-state). Cooldown markets are held back.",
      "🎯 'Motivated owners (free)' button: counts absentee / out-of-state / tax-delinquent land owners per market — the signals that answer cold mail fastest — and scores each market so you pull where the richest owner pool is.",
      "📈 Market price trends now refresh themselves weekly (no button needed) and cover the SC metros too.",
      "To pull: read the Pull Plan recipe → open the 🏕 DealMachine panel → search that county → set the preset → Count (free) → Pull.",
    ],
  },
  {
    id: "market-research-map", date: "2026-11-06", emoji: "🗺", title: "Target Markets — research & pull land from a live map",
    blurb: "A real map of our FL markets with buyer coverage, a market-analysis engine (Location Quotient + opportunity scoring), and DealMachine built in to research areas and pull land leads straight into the CRM.",
    audience: ["leadership", "acq"], where: { label: "Target Markets", href: "/markets" },
    steps: [
      "🗺 Map: satellite view of our markets — glowing = we have buyers who'll take deals there, dim = open territory. Search a county or ZIP to mark where we're marketing / have pulled, or bulk-paste a list of ZIPs. Marked areas show how many leads & deals we have inside them.",
      "📊 Analysis tab: markets ranked by an opportunity score. '🔥 PULL NOW' = buyers want it AND we've never pulled. Location Quotient (LQ) shows which markets over-index on wealth, demand, or deals. Hit 📚 Playbook for how each market-analysis tool works.",
      "🏕 DealMachine research (bottom of the page): pick a county/city/ZIP + a land buy-box (infill, big acreage, commercial, absentee/out-of-state, tax-delinquent) → 'Count parcels' shows how much off-market land is there. Counts are FREE.",
      "⬇️ Pull: once you like an area, 'Pull 25/50/100' skip-traces the owners and imports them as land leads to Michelle (uses ~1 credit each of our 10k/mo). They land in the Seller CRM, quiet-hours-safe.",
      "📡 'Load live land inventory' on the Analysis tab counts real parcels in every market so you can rank by supply too.",
      "Heads-up: if DealMachine shows 'needs v2 key', Jon adds a key in settings — the free map/analysis still work without it.",
    ],
  },
  {
    id: "cards-cleaner-leadkind", date: "2026-11-04", emoji: "🧹", title: "Cleaner lead cards + mark Land vs House",
    blurb: "Card badges now stay on the card (no more running off the edge), land sellers show ONE badge, and you can set Land/House by hand when auto-detect is wrong.",
    audience: ["all"], where: { label: "Seller CRM", href: "/crm" },
    steps: [
      "The little status badges now wrap onto the card instead of sliding off to the right — everything's visible.",
      "A land seller shows a single 🏞 Land badge (no more 'Seller' + 'Land' doubled up). Freshly-worked and brand-new leads drop their extra chips to cut clutter.",
      "Auto-detect calling a land lead a house? Click the 🏞/🏡 chip on the card's quick-view (or full page) to set it by hand — it sticks.",
      "Deal value always shows $ now: type '13k', '$13,000' or '13000' and it saves as $13,000.",
    ],
  },
  {
    id: "stage-followups", date: "2026-11-04", emoji: "📨", title: "Follow-ups that arm themselves by stage",
    blurb: "Move a seller into Contract Sent, Negotiating, Offer Ready, 10 Days of Hell or Ghosted and the matching follow-up sequence arms itself — you just review and send.",
    audience: ["acq", "dispo", "leadership"], where: { label: "Seller CRM", href: "/crm" },
    steps: [
      "When you move a seller to a stage that has a sequence, the right follow-up cadence arms automatically.",
      "Each step drops a ready-to-send task with the drafted text/email — you review and fire it with one click. Nothing sends on its own.",
      "If the seller replies, the sequence stops automatically so you never double-message.",
      "Start, stop, or switch sequences any time from the lead's quick-view (the 📨 sequence box). '· auto' means a stage armed it.",
    ],
  },
  {
    id: "war-room-guide", date: "2026-11-04", emoji: "📖", title: "New: the War Room Guide",
    blurb: "The whole app drawn as a building — click any room to see what it does. Great for getting oriented or training someone new.",
    audience: ["all"], where: { label: "War Room Guide", href: "/blueprint" },
    steps: [
      "Open Requests & Support → War Room Guide.",
      "Each wing is an area of the business; each room is a page. Click any room to read what it does and walk straight in.",
      "Tap 'follow a deal' to watch one deal travel from the first call all the way to closing.",
      "New teammate? Point them here first — it's the fastest way to learn where everything lives.",
    ],
  },
  {
    id: "kpi-watch", date: "2026-11-03", emoji: "⚠️", title: "KPI issues: the Watch list (not daily noise)",
    blurb: "Alerts now opens on a short 'Watch' list of the few KPIs with a SUSTAINED problem — streaks and chronic misses — instead of every daily blip.",
    audience: ["leadership"], where: { label: "KPI Watch", href: "/alerts" },
    steps: [
      "Open Alerts → it lands on '⚠️ Watch' — only rep-KPIs on a 3+ day miss streak or below goal most of the last ~2 weeks.",
      "Worst-first. Each shows the reason, last value vs goal, and average shortfall.",
      "Anything at the PIP threshold (4+ streak) has an 'Open a plan' button.",
      "Scan it weekly, not daily. The raw per-day list is still there under 'All open'.",
    ],
  },
  {
    id: "offers-net-margin", date: "2026-11-03", emoji: "💰", title: "Offers: see what we actually NET",
    blurb: "Each offer now has a buyer type (direct / agent / JV) and a per-deal 'under contract at' — so you see net, profit and margin, and 'best' ranks by net not gross.",
    audience: ["dispo", "leadership"], where: { label: "Open a deal", href: "/dispo?tab=today" },
    steps: [
      "On a deal's 💰 Offers panel, set '📑 Under contract at' = what we have it under contract for (our cost).",
      "On each offer pick the buyer type: 🏗 Direct (full offer), 🧑‍💼 Agent (−10% commission off the top), 🤝 JV (split the spread — set our %).",
      "Each row shows net to us + profit (+/−) + % margin. The ⭐ best offer is the one that nets us the most, not the biggest sticker price.",
    ],
  },
  {
    id: "sms-owner-unread", date: "2026-11-03", emoji: "🔵", title: "Texts belong to the lead's owner",
    blurb: "A text's unread flag now follows the lead owner — someone else opening it no longer clears it for you. Plus a 'mark unread' button.",
    audience: ["all"], where: { label: "Conversations", href: "/crm/conversations" },
    steps: [
      "Open a thread — it only clears the unread dot if YOU own the lead (or it's unassigned).",
      "The header shows whose it is: 👤 Yours / 👤 <owner>'s / ⚠️ Unassigned.",
      "Opened one that's really someone else's? Hit '🔵 Unread' to send it back to their inbox.",
      "To hand off responsibility, change the owner in the lead's rail — the texts follow the new owner.",
    ],
  },
  {
    id: "speed-on-availability", date: "2026-11-03", emoji: "📡", title: "Internet speed on the availability board",
    blurb: "Each person's latest internet speed now shows on 'Who's available right now' — station status and connection in one place.",
    audience: ["all"], where: { label: "Schedule", href: "/schedule" },
    steps: [
      "Open Schedule → 'Who's available right now'. Each person shows a 📡 Mbps badge (green 50+, amber 25-49, red under 25).",
      "Grey '📡 no test' = they haven't run today's speed test yet — run it on Enter KPIs.",
      "Managers: '📡 Speed history →' by the board opens the full day-by-day detail.",
    ],
  },
  {
    id: "deal-next-step", date: "2026-10-23", emoji: "⏭", title: "Next-step guidance on every deal",
    blurb: "Each deal now tells you the ONE move that pushes it toward sold — no more guessing what to do next.",
    audience: ["dispo"], where: { label: "Open a deal", href: "/dispo?tab=today" },
    steps: [
      "Open any dispo deal — a '⏭ Next step' banner is at the top of the buyer panels.",
      "It reads your deal's state and tells you exactly what to do: run the cascade, chase offers, hand the best to the seller, draft/send the contract, or advance a stalled deal.",
      "Do that step. The banner updates as the deal moves.",
    ],
  },
  {
    id: "dispo-velocity-accountability", date: "2026-10-23", emoji: "📋", title: "Command Center: velocity + accountability",
    blurb: "The Today board now shows stuck deals, who owns what, and flags buyers that would slip — and lets you act in one click.",
    audience: ["dispo", "leadership"], where: { label: "Today board", href: "/dispo?tab=today" },
    steps: [
      "🐌 Stuck — deals not advancing in 6+ days. Un-stick them (they're killing velocity).",
      "📋 Accountability table — each rep's deals, overdue follow-ups, due today, stuck, stale. Red = act now.",
      "👻 No next step — buyers with no follow-up scheduled; hit 📞 Touch to set one so they don't slip.",
      "⚡ Cascade / More buttons — push a not-out deal to buyers, or add buyers to chase the 3rd offer, right from the board.",
    ],
    playbook: "Dispo Deal Playbook",
  },
  {
    id: "buyer-coverage", date: "2026-10-22", emoji: "🗺", title: "Coverage gaps + 'what they pay'",
    blurb: "In Vetted Buyers: where we have deals but no buyer (source one), plus a free-text 'what they pay' on each buyer.",
    audience: ["dispo", "leadership", "acq"], where: { label: "Vetted Buyers", href: "/marketing" },
    steps: [
      "Open Vetted Buyers → 🃏 Buyers → expand '🗺 Coverage gaps — deals vs our buyers'.",
      "Red 'Source a buyer for these' = deals with no matching vetted buyer (sourcing priority).",
      "Price / acreage bands: 🔴 no buyers, 🟡 thin, 🟢 covered, 💤 buyers waiting.",
      "Capture each developer's pricing: Vetted Buyers → 📥 Interviews → 'What they pay' (free text).",
    ],
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
