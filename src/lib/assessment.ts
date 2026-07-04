// In-house behavioral assessment engine — an ORIGINAL DISC-based instrument (the
// same public framework PI and McQuaig are built on), written from scratch so it's
// ours to use freely. Two instruments feed one scoring model:
//   • Work Styles — free-choice adjective checklist (two passes: expected vs real self)
//   • Word Survey — forced-choice "most / least like me" word groups
// Both resolve to four factors and a named reference profile.

export type Factor = "D" | "I" | "S" | "C";
// D = Drive/Dominance · I = Influence/Extraversion · S = Steadiness/Patience · C = Conscientiousness/Precision
export const FACTORS: { key: Factor; name: string; short: string; color: string; high: string; low: string }[] = [
  { key: "D", name: "Drive", short: "Dominance", color: "#dc2626", high: "assertive, decisive, competitive, takes charge", low: "cooperative, agreeable, cautious, accommodating" },
  { key: "I", name: "Influence", short: "Extraversion", color: "#ea580c", high: "outgoing, persuasive, talkative, connects fast", low: "reserved, reflective, task-first, selective socially" },
  { key: "S", name: "Steadiness", short: "Patience", color: "#16a34a", high: "patient, steady, consistent, great follow-through", low: "fast-paced, restless, thrives on change, urgent" },
  { key: "C", name: "Precision", short: "Formality", color: "#2563eb", high: "careful, detail-oriented, follows process, accurate", low: "big-picture, flexible, improvises, breaks rules" },
];

export interface DiscScore { D: number; I: number; S: number; C: number } // 0–100 each

// ---- Work Styles: free-choice adjective bank (each adjective → one factor) ----
// Candidate checks every word that fits, twice: once for "how I'm expected to act at
// work" (self-concept), once for "the real me" (natural self).
export const WORK_STYLES_WORDS: { w: string; f: Factor }[] = [
  { w: "assertive", f: "D" }, { w: "decisive", f: "D" }, { w: "competitive", f: "D" }, { w: "direct", f: "D" },
  { w: "bold", f: "D" }, { w: "driven", f: "D" }, { w: "takes charge", f: "D" }, { w: "risk-taking", f: "D" },
  { w: "independent", f: "D" }, { w: "demanding", f: "D" }, { w: "results-focused", f: "D" }, { w: "forceful", f: "D" },
  { w: "outgoing", f: "I" }, { w: "persuasive", f: "I" }, { w: "enthusiastic", f: "I" }, { w: "talkative", f: "I" },
  { w: "friendly", f: "I" }, { w: "optimistic", f: "I" }, { w: "charming", f: "I" }, { w: "expressive", f: "I" },
  { w: "sociable", f: "I" }, { w: "inspiring", f: "I" }, { w: "warm", f: "I" }, { w: "energetic", f: "I" },
  { w: "patient", f: "S" }, { w: "steady", f: "S" }, { w: "consistent", f: "S" }, { w: "calm", f: "S" },
  { w: "supportive", f: "S" }, { w: "loyal", f: "S" }, { w: "dependable", f: "S" }, { w: "easygoing", f: "S" },
  { w: "deliberate", f: "S" }, { w: "good listener", f: "S" }, { w: "team-first", f: "S" }, { w: "even-tempered", f: "S" },
  { w: "careful", f: "C" }, { w: "precise", f: "C" }, { w: "organized", f: "C" }, { w: "analytical", f: "C" },
  { w: "thorough", f: "C" }, { w: "accurate", f: "C" }, { w: "follows process", f: "C" }, { w: "detail-oriented", f: "C" },
  { w: "logical", f: "C" }, { w: "systematic", f: "C" }, { w: "disciplined", f: "C" }, { w: "quality-focused", f: "C" },
];

// ---- Word Survey: forced-choice groups (pick MOST + LEAST like you) ----
// Each group has four words spanning the factors. MOST → +2 that factor, LEAST → −1.
export const WORD_SURVEY_GROUPS: { w: string; f: Factor }[][] = [
  [{ w: "Take-charge", f: "D" }, { w: "Playful", f: "I" }, { w: "Patient", f: "S" }, { w: "Exact", f: "C" }],
  [{ w: "Competitive", f: "D" }, { w: "Talkative", f: "I" }, { w: "Loyal", f: "S" }, { w: "Careful", f: "C" }],
  [{ w: "Bold", f: "D" }, { w: "Persuasive", f: "I" }, { w: "Calm", f: "S" }, { w: "Analytical", f: "C" }],
  [{ w: "Decisive", f: "D" }, { w: "Enthusiastic", f: "I" }, { w: "Steady", f: "S" }, { w: "Precise", f: "C" }],
  [{ w: "Direct", f: "D" }, { w: "Outgoing", f: "I" }, { w: "Supportive", f: "S" }, { w: "Organized", f: "C" }],
  [{ w: "Driven", f: "D" }, { w: "Charming", f: "I" }, { w: "Dependable", f: "S" }, { w: "Logical", f: "C" }],
  [{ w: "Forceful", f: "D" }, { w: "Expressive", f: "I" }, { w: "Easygoing", f: "S" }, { w: "Thorough", f: "C" }],
  [{ w: "Independent", f: "D" }, { w: "Sociable", f: "I" }, { w: "Consistent", f: "S" }, { w: "Systematic", f: "C" }],
  [{ w: "Risk-taker", f: "D" }, { w: "Inspiring", f: "I" }, { w: "Good listener", f: "S" }, { w: "Disciplined", f: "C" }],
  [{ w: "Ambitious", f: "D" }, { w: "Warm", f: "I" }, { w: "Cooperative", f: "S" }, { w: "Accurate", f: "C" }],
  [{ w: "Assertive", f: "D" }, { w: "Fun-loving", f: "I" }, { w: "Reliable", f: "S" }, { w: "Methodical", f: "C" }],
  [{ w: "Blunt", f: "D" }, { w: "Lively", f: "I" }, { w: "Gentle", f: "S" }, { w: "Reserved", f: "C" }],
  [{ w: "Pioneering", f: "D" }, { w: "Convincing", f: "I" }, { w: "Predictable", f: "S" }, { w: "Cautious", f: "C" }],
  [{ w: "Strong-willed", f: "D" }, { w: "Cheerful", f: "I" }, { w: "Composed", f: "S" }, { w: "Perfectionist", f: "C" }],
];

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Score the Work Styles checklist. `natural` (the real self) drives the profile;
 *  `expected` is kept for a self-vs-role stretch read. Returns 0–100 per factor. */
export function scoreWorkStyles(natural: string[], expected: string[] = []): { disc: DiscScore; self: DiscScore } {
  const tally = (words: string[]) => {
    const raw: Record<Factor, number> = { D: 0, I: 0, S: 0, C: 0 };
    const max: Record<Factor, number> = { D: 0, I: 0, S: 0, C: 0 };
    for (const { w, f } of WORK_STYLES_WORDS) { max[f] += 1; if (words.includes(w)) raw[f] += 1; }
    return { D: clamp((raw.D / (max.D || 1)) * 100), I: clamp((raw.I / (max.I || 1)) * 100), S: clamp((raw.S / (max.S || 1)) * 100), C: clamp((raw.C / (max.C || 1)) * 100) };
  };
  return { disc: tally(natural), self: expected.length ? tally(expected) : tally(natural) };
}

/** Score the forced-choice Word Survey. `most`/`least` are arrays of the chosen word
 *  per group (index-aligned to WORD_SURVEY_GROUPS). Returns 0–100 per factor. */
export function scoreWordSurvey(most: string[], least: string[]): DiscScore {
  const raw: Record<Factor, number> = { D: 0, I: 0, S: 0, C: 0 };
  const factorOf = (word: string) => WORD_SURVEY_GROUPS.flat().find((x) => x.w === word)?.f;
  for (const w of most) { const f = factorOf(w); if (f) raw[f] += 2; }
  for (const w of least) { const f = factorOf(w); if (f) raw[f] -= 1; }
  // Normalize: min possible per factor ≈ −groups, max ≈ 2·groups. Rescale to 0–100.
  const g = WORD_SURVEY_GROUPS.length;
  const rescale = (v: number) => clamp(((v + g) / (3 * g)) * 100);
  return { D: rescale(raw.D), I: rescale(raw.I), S: rescale(raw.S), C: rescale(raw.C) };
}

// ---- Reference profiles (our own, mapped by the top two factors) ----
export interface Profile {
  key: string; name: string; emoji: string; blurb: string;
  strengths: string[]; watchouts: string[]; comms: string; motivate: string; seat: string;
}
export const PROFILES: Record<string, Profile> = {
  driver:      { key: "driver", name: "The Closer", emoji: "🚀", blurb: "Fast, decisive, and results-obsessed. Runs at problems head-on and hates standing still.", strengths: ["Closes and decides fast", "Comfortable with pressure + rejection", "Self-starting, needs little hand-holding"], watchouts: ["Can steamroll people", "Impatient with detail/process"], comms: "Be brief, be bold, lead with the bottom line. Don't over-explain.", motivate: "Give autonomy, a scoreboard, and a challenge to win.", seat: "Acquisitions closer / lead of a lane" },
  captain:     { key: "captain", name: "The Rainmaker", emoji: "🎖️", blurb: "Drives results AND rallies people. A natural front-of-room leader who sells the vision and pushes the pace.", strengths: ["Leads + persuades at once", "Sets the tone, high energy", "Great at high-stakes negotiations"], watchouts: ["Can dominate the room", "May skip the fine print"], comms: "Give them the goal and let them run; recognize wins publicly.", motivate: "Visibility, leadership scope, and a bigger game to win.", seat: "Acquisitions lead / sales team lead" },
  persuader:   { key: "persuader", name: "The Rapport Builder", emoji: "🗣️", blurb: "Outgoing, charismatic, and hard to say no to. Builds rapport in seconds and thrives on people.", strengths: ["Instant rapport + trust", "Handles objections warmly", "Thrives on calls and pitches"], watchouts: ["Can overpromise", "Loses steam on admin/follow-up"], comms: "Be friendly and enthusiastic; let them talk it through.", motivate: "Recognition, social wins, and variety in the day.", seat: "Acquisitions / Dispositions (buyer & agent calls)" },
  connector:   { key: "connector", name: "The Relationship Manager", emoji: "🤝", blurb: "Warm, likable, and relationship-first. Keeps buyers, sellers, and agents feeling looked-after.", strengths: ["Deep, lasting relationships", "Calm, trustworthy presence", "Great at nurturing pipelines"], watchouts: ["Avoids hard confrontation", "Can be too soft on price"], comms: "Be personal and patient; don't rush them.", motivate: "Belonging, appreciation, and a stable team.", seat: "Dispositions / buyer & developer relationships" },
  anchor:      { key: "anchor", name: "The Follow-Up Machine", emoji: "⚓", blurb: "Steady, dependable, and unflappable. The person you can hand a routine to and never worry about it.", strengths: ["Rock-solid follow-through", "Calm under chaos", "Loyal, low-drama"], watchouts: ["Resists sudden change", "Slow to speak up"], comms: "Give clear expectations and steady, sincere feedback.", motivate: "Security, routine, and genuine appreciation.", seat: "Operations / lead management / follow-up" },
  guardian:    { key: "guardian", name: "The Transaction Coordinator", emoji: "🛡️", blurb: "Dependable and precise. Protects the process, keeps the books straight, and follows through to the letter.", strengths: ["Reliable + accurate", "Follows and improves process", "Trustworthy with details + money"], watchouts: ["Cautious with change", "Can over-check"], comms: "Give clear steps, timelines, and the 'why' behind rules.", motivate: "Stability, clear standards, and being counted on.", seat: "Operations / transaction coordination / compliance" },
  analyst:     { key: "analyst", name: "The Underwriter", emoji: "🔎", blurb: "Careful, logical, and detail-driven. Wants the numbers right and the plan airtight before moving.", strengths: ["Deep accuracy + rigor", "Spots errors + risk early", "Great with data + underwriting"], watchouts: ["Can over-analyze / slow down", "Reserved socially"], comms: "Give facts, data, and time to think; avoid pressure.", motivate: "Being right, mastering the craft, quality standards.", seat: "Underwriting / comps / data + reporting" },
  strategist:  { key: "strategist", name: "The Deal Architect", emoji: "♟️", blurb: "Analytical and driving at once — plans the play, then pushes to execute it. Cool-headed problem-solver.", strengths: ["Turns analysis into action", "Decisive but grounded in data", "Sees the whole board"], watchouts: ["Impatient with sloppiness", "Can seem cold"], comms: "Bring logic + a clear objective; respect their expertise.", motivate: "Hard problems, autonomy, and measurable impact.", seat: "Underwriting lead / ops strategy / systems" },
  operator:    { key: "operator", name: "The Operator", emoji: "⚙️", blurb: "Drives to get it done AND does it right. Efficient, disciplined execution with a bias for action.", strengths: ["Ships work fast + clean", "Holds standards under pressure", "Reliable finisher"], watchouts: ["Low patience for ambiguity", "Blunt when rushed"], comms: "Be clear and organized; give them ownership of outcomes.", motivate: "Efficiency wins, control of their lane, visible results.", seat: "Operations lead / process execution" },
  collaborator:{ key: "collaborator", name: "The Team Glue", emoji: "🧩", blurb: "Supportive team player who blends warmth with reliability. Glue that keeps the group moving together.", strengths: ["Easy to work with", "Steady + encouraging", "Bridges people"], watchouts: ["Conflict-avoidant", "Defers too much"], comms: "Be inclusive and warm; invite their input.", motivate: "Team harmony, appreciation, shared wins.", seat: "Lead management / support / coordination" },
  adapter:     { key: "adapter", name: "The Utility Player", emoji: "🌊", blurb: "Balanced and flexible — reads the room and shifts to whatever the moment needs. A versatile generalist.", strengths: ["Fits many roles", "Reads people well", "Comfortable with change"], watchouts: ["Can lack a clear lane", "Spreads thin"], comms: "Clarify priorities so they focus their range.", motivate: "Variety, growth, and a clear #1 priority.", seat: "Flexible — rotate to the team's biggest need" },
};

// Map the (top, second) factor pair to a profile. Balanced scores → Adapter.
const PAIR_MAP: Record<string, string> = {
  DI: "captain", DC: "operator", DS: "driver",
  ID: "persuader", IS: "connector", IC: "persuader",
  SD: "anchor", SI: "collaborator", SC: "guardian",
  CD: "strategist", CI: "analyst", CS: "analyst",
};

export function profileFor(disc: DiscScore): Profile {
  const ranked = (["D", "I", "S", "C"] as Factor[]).sort((a, b) => disc[b] - disc[a]);
  const spread = disc[ranked[0]] - disc[ranked[3]];
  if (spread < 12) return PROFILES.adapter; // no strong signal → versatile generalist
  const top = ranked[0];
  const gapTop = disc[ranked[0]] - disc[ranked[1]];
  // Very dominant single factor → its "pure" profile.
  if (gapTop >= 18) return PROFILES[{ D: "driver", I: "persuader", S: "anchor", C: "analyst" }[top]];
  const key = PAIR_MAP[`${ranked[0]}${ranked[1]}`] ?? PROFILES.adapter.key;
  return PROFILES[key] ?? PROFILES.adapter;
}
