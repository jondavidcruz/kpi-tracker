// 🚦 Option B — SOP gates wired into the dispo pipeline (Jon 2026-10-21, rebuilt).
// The gate PATH is driven by the PIPELINE (the pipeline IS the deal type):
//   • DS: Sell Land Then Sign   → land  (pre-marketing cascade for land)
//   • DS: Signed Off Market      → cash  (signed, find a cash buyer off-market)
//   • DS: Signed Go Close        → novation (signed, list / agent to market)
// Each gate is matched to the ACTUAL current stage by identity (not by index), so a
// deal already at "Sent to Agents" shows that stage's gate, not the new-lead gate.
// Checks are stored per deal in formData.__gates; no schema migration. Client-safe.

export type GatePath = "cash" | "novation" | "land";
export type Stage = { key: string; label: string };

// Emojis per process (Jon 2026-10-24): Novation = 🪧 (listed/on-market sign),
// Off-market assignment = 🤝, Find-buyer = 🤝. Novation is the one that's NOT a
// handshake so the three read distinctly on the switcher.
export const PATH_META: Record<GatePath, { label: string; emoji: string }> = {
  cash: { label: "Off market — assignment to a cash buyer", emoji: "🤝" },
  novation: { label: "On market — list through a listing agent", emoji: "🪧" },
  land: { label: "Find a buyer (unsigned)", emoji: "🤝" },
};

/** The pipeline decides the gate path. Tolerant of Jon's live names:
 *  "DS: Signed - Novation", "DS: Unsigned - Find Buyer", "DS: Signed - Wholesale",
 *  "DS: Signed Off Market", plus the legacy "Sell Land Then Sign"/"Signed Go Close". */
export function pathForPipeline(pipeline?: string | null): GatePath {
  const n = (pipeline ?? "").toLowerCase();
  if (/novation|on.?market/.test(n)) return "novation";
  if (/wholesale|off.?market|assign/.test(n)) return "cash";
  if (/find buyer|unsigned|sell land/.test(n)) return "land";
  if (/go close|signed/.test(n)) return "novation"; // legacy "DS: Signed Go Close"
  return "land";
}

// A stage is a SIDE stage (nurture / dead / delayed / lost) — never gated, and a deal
// can always be moved into one. NOTE: must NOT match "Offered/Contract Sent (No Buyer)"
// or "Sent to Agents/Buyers" — only the standalone "No Buyer Interest" nurture column.
const SIDE_STAGE = /nurtur|\bdead\b|died|delay|\blien\b|overpric|archive|\blost\b|no buyer interest|not interested/i;
export function isSideStage(stage: Stage): boolean {
  return SIDE_STAGE.test(stage.label) || SIDE_STAGE.test(stage.key);
}

export type DispoGate = { key: string; label: string; match: RegExp; checks: string[] };

// `match` identifies WHICH stage each gate guards. First match wins, so order the
// gates so earlier/narrower patterns come first.
export const GATE_PATHS: Record<GatePath, DispoGate[]> = {
  land: [
    { key: "land_intake", label: "Intake complete", match: /new land|new lead|intake/i, checks: [
      "All intake fields filled — no blanks",
      "Parcel / APN recorded (not just the address)",
      "City vs. county jurisdiction answered",
      "Owner assigned",
    ] },
    { key: "land_packet", label: "Packet built + released", match: /offered|contract sent|packet/i, checks: [
      "Four docs pulled + four-point check passed",
      "Utilities reconciled — no “no utilities” to a buyer",
      "Owner name blurred, no asking price in the packet",
      "Jon signed off for release",
    ] },
    { key: "land_cascade", label: "Cascade fired", match: /sent to agent|\bjvp\b/i, checks: [
      "Tier 1 vetted developers called + texted + emailed",
      "Tier 2 cash buyers in the market area",
      "Tier 3 buyer agents, then Tier 4 passive channels",
      "Every touch logged — nothing untracked",
    ] },
    { key: "land_offers", label: "Offers worked", match: /received.*offer|offers in|3 offers/i, checks: [
      "Every offer logged with all five fields",
      "Best offer handed back to acquisitions / the seller",
    ] },
  ],
  // 💵 CASH = WHOLESALE (Jon 2026-10-22): signed, but we find OFF-MARKET buyers — the
  // same find-a-buyer play as land, just already under contract. NOT a listing.
  cash: [
    { key: "cash_ready", label: "Ready to market", match: /new|signed|packet|photo/i, checks: [
      "Specs / APN + photos + packet ready to send",
      "Vetted cash-buyer + agent list pulled for this market",
      "Deal armed to go out",
    ] },
    { key: "cash_cascade", label: "Cascade fired — out to buyers", match: /sent to (buyer|agent)|cascade/i, checks: [
      "Matched cash buyers + agents called + texted + emailed",
      "Every buyer logged in the tracker — nothing untracked",
      "Top-tier buyers chased for a price",
    ] },
    { key: "cash_offers", label: "Offers worked (goal: 3)", match: /offers? in|received.*offer|3 offers/i, checks: [
      "At least 3 offers logged (the minimum goal)",
      "Best offer selected",
    ] },
    { key: "cash_assigned", label: "Under assignment", match: /assign|under contract/i, checks: [
      "Cash buyer committed + assignment signed",
      "EMD received",
    ] },
    { key: "cash_escrow", label: "In escrow → close", match: /escrow/i, checks: [
      "Title / escrow opened",
      "All closing docs in",
    ] },
  ],
  // 🤝 NOVATION = listing: get a listing agent to walk + photo + list on MLS, take
  // offers, accept one, open escrow, close (Jon 2026-10-22).
  novation: [
    { key: "nov_setup", label: "Agent + photos ready", match: /new|photo|day 1|intake/i, checks: [
      "Listing agent engaged — walk scheduled",
      "Property walked + photos taken",
      "Listing price + terms set",
    ] },
    { key: "nov_market", label: "On market", match: /on market|marketing/i, checks: [
      "Listed on the MLS / live",
      "Showings + offers being tracked",
      "A buyer agent is actively working it",
    ] },
    { key: "nov_escrow", label: "Offer accepted → escrow", match: /escrow/i, checks: [
      "An offer is accepted + the buyer is qualified",
      "Novation contract executed",
      "Escrow opened",
    ] },
    { key: "nov_closing", label: "Clear to close", match: /closing/i, checks: [
      "Closing scheduled",
      "All closing docs in",
    ] },
  ],
};

export function readGateChecks(formData: unknown): Record<string, boolean[]> {
  const g = (formData as { __gates?: unknown } | null)?.__gates;
  return g && typeof g === "object" && !Array.isArray(g) ? (g as Record<string, boolean[]>) : {};
}

export function gateCleared(gate: DispoGate, checks: Record<string, boolean[]>): boolean {
  const arr = checks[gate.key] ?? [];
  return gate.checks.every((_, i) => !!arr[i]);
}

/** The gate for a specific stage (matched by the stage's own label/key). */
export function gateForStage(path: GatePath, stage?: Stage | null): DispoGate | null {
  if (!stage || isSideStage(stage)) return null;
  return GATE_PATHS[path].find((g) => g.match.test(stage.label) || g.match.test(stage.key)) ?? null;
}

/** The gate guarding the deal's CURRENT stage. */
export function gateForCurrentStage(path: GatePath, stages: Stage[], currentStage: string): DispoGate | null {
  const s = stages.find((x) => x.key === currentStage);
  return gateForStage(path, s);
}

/** The next MAIN (non-side) stage to advance into, in pipeline order. */
export function nextMainStage(stages: Stage[], currentStage: string): Stage | null {
  const i = stages.findIndex((s) => s.key === currentStage);
  if (i < 0) return null;
  for (let j = i + 1; j < stages.length; j++) if (!isSideStage(stages[j])) return stages[j];
  return null;
}

/** Enforcement: is moving from `currentStage` to `targetStage` blocked? Forward only —
 *  moving backward or into a side stage is always allowed. Every gated stage we pass
 *  through (current up to, but not including, target) must be cleared. */
export function stageMoveBlocked(
  path: GatePath,
  stages: Stage[],
  currentStage: string,
  targetStage: string,
  checks: Record<string, boolean[]>,
): { blocked: boolean; gate?: DispoGate } {
  const curIdx = stages.findIndex((s) => s.key === currentStage);
  const tgtIdx = stages.findIndex((s) => s.key === targetStage);
  if (curIdx < 0 || tgtIdx < 0) return { blocked: false };
  const target = stages[tgtIdx];
  if (isSideStage(target)) return { blocked: false }; // nurture / dead — always allowed
  if (tgtIdx <= curIdx) return { blocked: false }; // backward / same
  for (let i = curIdx; i < tgtIdx; i++) {
    const g = gateForStage(path, stages[i]);
    if (g && !gateCleared(g, checks)) return { blocked: true, gate: g };
  }
  return { blocked: false };
}
