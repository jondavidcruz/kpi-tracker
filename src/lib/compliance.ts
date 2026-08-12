// Compliance reference + operating-footprint derivation for the War Room.
// Content is OPERATIONAL guidance, not legal advice — the page shows a standing
// disclaimer. State rules focus on well-established federal frameworks plus
// commonly-cited stricter-state notes; anything uncertain is flagged "verify".
import { db } from "./db";

// ---- US states -------------------------------------------------------------
export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

// Metro / area tokens → state, so free-text markets like "San Diego" or "Orange County"
// resolve to CA even when no state code is written.
const METRO_TO_STATE: [RegExp, string][] = [
  [/\b(san diego|orange county|\boc\b|los angeles|\bla\b|riverside|san bernardino|inland empire|\bie\b|temecula|carlsbad|oceanside|chula vista|escondido|sacramento|bay area|san francisco|san jose|fresno|bakersfield|long beach|anaheim|irvine|socal|norcal)\b/i, "CA"],
  [/\b(phoenix|scottsdale|tucson|mesa|tempe|maricopa)\b/i, "AZ"],
  [/\b(las vegas|henderson|reno|\bnv\b)\b/i, "NV"],
  [/\b(dallas|houston|austin|san antonio|fort worth|dfw)\b/i, "TX"],
  [/\b(miami|orlando|tampa|jacksonville|fort lauderdale|palm beach)\b/i, "FL"],
  [/\b(atlanta|\batl\b|savannah)\b/i, "GA"],
  [/\b(seattle|tacoma|spokane|bellevue)\b/i, "WA"],
  [/\b(portland|salem|eugene)\b/i, "OR"],
];

/** Detect US state codes mentioned in a blob of free text. */
export function detectStates(text: string): Set<string> {
  const found = new Set<string>();
  if (!text) return found;
  // Full names
  for (const [code, name] of Object.entries(US_STATES)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) found.add(code);
  }
  // Two-letter codes (word-boundary, uppercase-ish) — avoid matching random words.
  const codeMatches = text.match(/\b[A-Z]{2}\b/g) ?? [];
  for (const m of codeMatches) if (US_STATES[m]) found.add(m);
  // Metro tokens
  for (const [re, code] of METRO_TO_STATE) if (re.test(text)) found.add(code);
  return found;
}

export interface StateSignal { code: string; name: string; hits: number }

/**
 * Derive the states we actually operate in from where we source developers/buyers
 * (MarketContact market/area/region) and our deals (addresses). Ranked by signal.
 */
export async function deriveOperatingStates(): Promise<StateSignal[]> {
  const [contacts, deals] = await Promise.all([
    db.marketContact.findMany({ select: { market: true, buyBoxAreas: true, region: true, vetArea: true, marketDetails: true } }),
    db.deal.findMany({ where: { active: true }, select: { address: true } }),
  ]);
  const tally = new Map<string, number>();
  const bump = (codes: Set<string>) => { for (const c of codes) tally.set(c, (tally.get(c) ?? 0) + 1); };
  for (const c of contacts) bump(detectStates([c.market, c.buyBoxAreas, c.region, c.vetArea, c.marketDetails].join(" ")));
  for (const d of deals) bump(detectStates(d.address));

  const signals = [...tally.entries()]
    .map(([code, hits]) => ({ code, name: US_STATES[code] ?? code, hits }))
    .sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name));

  // We're a San Diego shop — always include California as the home base.
  if (!signals.some((s) => s.code === "CA")) signals.unshift({ code: "CA", name: "California", hits: 0 });
  return signals;
}

// ---- State rule matrix -----------------------------------------------------
// Conservative, operational notes. `callHours` is the called-party local-time
// window. `notes` are flagged where they're stricter than the federal baseline.
export interface StateRule {
  callHours: string;
  recording: string;   // call-recording consent posture
  notes: string[];     // stricter-than-federal flags / watch-outs
}

const FEDERAL_BASELINE: StateRule = {
  callHours: "8:00 AM – 9:00 PM (called party's local time) — federal TCPA/TSR default",
  recording: "One-party consent (federal). If either party is in a two-party state, get all-party consent.",
  notes: ["No state-specific stricter rule on file — apply the federal baseline and verify current state law before a campaign."],
};

// States with widely-cited stricter-than-federal telemarketing/texting rules.
export const STATE_RULES: Record<string, StateRule> = {
  CA: {
    callHours: "8:00 AM – 9:00 PM local",
    recording: "TWO-PARTY consent state — all parties must consent to call recording (CIPA). Announce/beep or get verbal opt-in.",
    notes: [
      "California mini-TCPA + CIPA exposure is high — record-recording consent is mandatory.",
      "CCPA/CPRA: honor data-deletion & do-not-sell requests for consumer contacts.",
    ],
  },
  FL: {
    callHours: "8:00 AM – 8:00 PM local (Florida Telemarketing Act — TIGHTER than federal)",
    recording: "TWO-PARTY consent state — get all-party consent to record.",
    notes: [
      "Florida 'mini-TCPA' (FTSA): prior express written consent required for autodialed/prerecorded calls AND texts; limit to 3 calls per 24h on the same subject.",
      "Calling window ends at 8 PM (not 9 PM). High litigation state — be strict.",
    ],
  },
  OK: {
    callHours: "8:00 AM – 8:00 PM local (Oklahoma Telephone Solicitation Act — TIGHTER)",
    recording: "One-party consent, but confirm before recording.",
    notes: [
      "Oklahoma 'mini-TCPA' (OTSA): consent required for autodialed calls/texts; active plaintiff's-bar target.",
    ],
  },
  WA: {
    callHours: "8:00 AM – 8:00 PM local",
    recording: "TWO-PARTY consent state — all-party consent to record.",
    notes: [
      "Washington CEMA: commercial texts to WA numbers without consent carry per-text damages. Get clear opt-in; honor STOP instantly.",
    ],
  },
  TX: {
    callHours: "8:00 AM – 9:00 PM local (no telemarketing before noon on Sunday)",
    recording: "One-party consent.",
    notes: ["Texas requires a telemarketer registration/certificate for some solicitation — verify if running outbound call campaigns."],
  },
  AZ: { callHours: "8:00 AM – 9:00 PM local", recording: "One-party consent.", notes: ["Apply federal baseline; verify AZ solicitation registration if scaling outbound."] },
  NV: { callHours: "8:00 AM – 9:00 PM local", recording: "One-party consent.", notes: ["Apply federal baseline; verify current NV rules before a campaign."] },
  GA: { callHours: "8:00 AM – 9:00 PM local", recording: "One-party consent.", notes: ["Apply federal baseline; verify current GA rules before a campaign."] },
  OR: { callHours: "8:00 AM – 9:00 PM local", recording: "One-party consent.", notes: ["Apply federal baseline; verify current OR rules before a campaign."] },
};

export function ruleFor(code: string): StateRule {
  return STATE_RULES[code] ?? FEDERAL_BASELINE;
}

export function isStricter(code: string): boolean {
  return code in STATE_RULES && STATE_RULES[code] !== FEDERAL_BASELINE;
}

// ---- Channel playbooks -----------------------------------------------------
export interface Playbook {
  key: string;
  title: string;
  emoji: string;
  law: string;        // governing framework
  dos: string[];
  donts: string[];
  consent?: string;   // copy-paste consent / opt-out language
}

export const PLAYBOOKS: Playbook[] = [
  {
    key: "a2p",
    title: "A2P 10DLC (SMS registration)",
    emoji: "📋",
    law: "Carrier requirement (TCR / The Campaign Registry) — enforced by Twilio, Telnyx & the mobile carriers",
    dos: [
      "Register the Brand + Campaign in The Campaign Registry BEFORE sending business texts.",
      "Match your registered use-case, sample messages, and opt-in flow to what you actually send.",
      "Publish a privacy policy + opt-in disclosure on the website the campaign references.",
      "Keep message content consistent with the approved campaign (no bait-and-switch).",
    ],
    donts: [
      "Don't send A2P traffic on unregistered 10DLC numbers — carriers filter/blocklist and answer rates crater.",
      "Don't share one number across unrelated campaigns.",
      "Don't include public-URL shorteners (bit.ly) — they trip spam filters; use a branded/dedicated domain.",
    ],
  },
  {
    key: "sms",
    title: "SMS / Texting (TCPA)",
    emoji: "💬",
    law: "TCPA + CTIA Messaging Principles; state mini-TCPAs (FL, OK, WA…)",
    dos: [
      "Get PRIOR EXPRESS WRITTEN CONSENT before texting (documented opt-in with timestamp + source).",
      "Honor STOP / UNSUBSCRIBE immediately and permanently; support HELP.",
      "Text only within the recipient's local quiet-hours window (8 AM–9 PM, tighter in strict states).",
      "Identify your business in the first message.",
    ],
    donts: [
      "Don't cold-text purchased/scraped lists — that's the #1 TCPA liability.",
      "Don't keep texting after an opt-out, even from a different number.",
      "Don't autodial/mass-text CA/FL/OK/WA numbers without documented consent — mini-TCPA per-text damages.",
    ],
    consent: "By providing your number you agree to receive texts from Freedom Offers about your property. Msg & data rates may apply. Reply STOP to opt out, HELP for help.",
  },
  {
    key: "coldcall",
    title: "Cold Calling",
    emoji: "📞",
    law: "TSR (Telemarketing Sales Rule) + National DNC Registry + state windows & 2-party recording",
    dos: [
      "Scrub every list against the National Do-Not-Call Registry AND your internal DNC before dialing.",
      "Call only 8 AM–9 PM the CALLED party's local time (tighter in FL/OK/WA — see the state matrix).",
      "Transmit accurate caller ID (name + a callable number).",
      "Honor do-not-call requests on the spot and log them permanently.",
      "In two-party states (CA, FL, WA…) announce the call is recorded or get verbal consent.",
    ],
    donts: [
      "Don't spoof or rotate caller ID to dodge spam labels — carriers flag it and it's a TSR violation.",
      "Don't call numbers on the DNC without an established business relationship or written consent.",
      "Don't use a prerecorded/voicemail-drop message without express consent.",
    ],
  },
  {
    key: "directmail",
    title: "Direct Mail",
    emoji: "✉️",
    law: "Least-regulated channel — FTC deceptive-practices + state UDAP; PII handling",
    dos: [
      "Keep offers truthful and non-deceptive (no fake 'checks', no implying government affiliation).",
      "Honor do-not-mail requests and suppress them going forward.",
      "Protect the mailing list — it contains PII; store/share it securely.",
      "Include a real return address and a way to opt out.",
    ],
    donts: [
      "Don't design mailers to look like official/government notices or urgent legal documents.",
      "Don't reuse another company's branding or make guarantees you can't keep.",
    ],
  },
  {
    key: "email",
    title: "Email",
    emoji: "📧",
    law: "CAN-SPAM Act",
    dos: [
      "Use accurate 'From', 'Reply-To', and routing info; subject lines must not mislead.",
      "Include a clear unsubscribe link and honor opt-outs within 10 business days.",
      "Include a valid physical postal address in every commercial email.",
      "Identify the message as an advertisement where required.",
    ],
    donts: [
      "Don't use harvested/scraped email lists or dictionary-attack addresses.",
      "Don't keep emailing after someone unsubscribes.",
      "Don't hide the sender or omit the unsubscribe + address.",
    ],
  },
];

export const COMPLIANCE_DISCLAIMER =
  "This is operational guidance to help the team stay compliant — it is NOT legal advice. Rules change and vary by state; confirm specifics with qualified counsel before launching any calling, texting, mailing, or email campaign.";
