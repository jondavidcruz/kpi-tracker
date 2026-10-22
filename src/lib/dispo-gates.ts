// 🚦 Option B — SOP gates wired into the dispo pipeline (Jon 2026-10-21). Every
// dispo deal carries a TYPE, and each type has its own ordered gate path. A deal
// can't move FORWARD to a later stage until the gate guarding its current stage is
// fully checked — the SOP enforces itself, same every time. Stored on the opp
// (formData.__dealType + formData.__gates); no schema migration. Client-safe: pure.

export type DealType = "cash" | "novation" | "land";

export const DEAL_TYPES: { key: DealType; label: string; emoji: string; blurb: string }[] = [
  { key: "cash", label: "All cash", emoji: "💵", blurb: "Signed cash deal — find a cash buyer off-market." },
  { key: "novation", label: "Novation", emoji: "🤝", blurb: "Signed novation — list / find a buyer through an agent." },
  { key: "land", label: "Sell land, then sign", emoji: "⛰️", blurb: "Unsigned land — run the buyer cascade before it signs." },
];

export type DispoGate = { key: string; label: string; checks: string[] };

// Each gate guards LEAVING the Nth forward stage of the deal's pipeline: gate[0]
// must be cleared to move past stage 0, gate[1] past stage 1, and so on.
export const GATE_PATHS: Record<DealType, DispoGate[]> = {
  cash: [
    { key: "cash_ready", label: "Deal ready to market", checks: [
      "Address / APN + acreage / specs complete",
      "Photos + packet ready to send",
      "Vetted cash-buyer list pulled for this market",
    ] },
    { key: "cash_worked", label: "Buyers worked", checks: [
      "Matched cash buyers called + texted + emailed",
      "Every buyer logged in the tracker — nothing untracked",
      "Top-tier buyers chased for a price",
    ] },
    { key: "cash_assigned", label: "Under assignment", checks: [
      "Cash buyer committed + assignment signed",
      "EMD received",
      "Title / escrow opened",
    ] },
    { key: "cash_closing", label: "Clear to close", checks: [
      "Closing date set",
      "All closing docs in",
    ] },
  ],
  novation: [
    { key: "nov_setup", label: "Novation set up", checks: [
      "Novation agreement in place with the seller",
      "Agent / broker list built for the area",
      "Listing price + terms set",
    ] },
    { key: "nov_listed", label: "Listed + agents engaged", checks: [
      "Listed or pitched to agents",
      "Showings / offers being tracked",
      "A buyer agent is actively working it",
    ] },
    { key: "nov_buyer", label: "Buyer locked", checks: [
      "Buyer offer accepted",
      "Novation contract executed",
      "Escrow opened",
    ] },
    { key: "nov_closing", label: "Clear to close", checks: [
      "Closing date set",
      "All closing docs in",
    ] },
  ],
  land: [
    { key: "land_intake", label: "Intake complete", checks: [
      "All intake fields filled — no blanks",
      "Parcel / APN recorded (not just the address)",
      "City vs. county jurisdiction answered",
      "Owner assigned",
    ] },
    { key: "land_packet", label: "Packet built + released", checks: [
      "Four docs pulled + four-point check passed",
      "Utilities reconciled — no “no utilities” to a buyer",
      "Owner name blurred, no asking price in the packet",
      "Jon signed off for release",
    ] },
    { key: "land_cascade", label: "Cascade fired", checks: [
      "Tier 1 vetted developers called + texted + emailed",
      "Tier 2 cash buyers in the market area",
      "Tier 3 buyer agents, then Tier 4 passive channels",
      "Every touch logged — nothing untracked",
    ] },
    { key: "land_offers", label: "Offers worked", checks: [
      "Every offer logged with all five fields",
      "Best offer handed back to acquisitions / the seller",
    ] },
  ],
};

// Side stages (nurture / dead / delayed / overpriced / no-buyer) aren't part of the
// forward track — moving INTO them is never gate-blocked.
const SIDE_STAGE = /nurtur|dead|died|delay|lien|overpric|no.?buyer|archive|lost/i;

export type Stage = { key: string; label: string };

export function forwardStages(stages: Stage[]): Stage[] {
  return stages.filter((s) => !SIDE_STAGE.test(s.key) && !SIDE_STAGE.test(s.label));
}

export function readDealType(formData: unknown): DealType | "" {
  const t = (formData as { __dealType?: string } | null)?.__dealType;
  return t === "cash" || t === "novation" || t === "land" ? t : "";
}

/** Sensible default when a type hasn't been picked yet. */
export function defaultDealType(pipeline?: string | null, tags?: string | null): DealType {
  if (/sell land/i.test(pipeline ?? "")) return "land";
  if (/novation/i.test(tags ?? "")) return "novation";
  return "cash";
}

export function readGateChecks(formData: unknown): Record<string, boolean[]> {
  const g = (formData as { __gates?: unknown } | null)?.__gates;
  return g && typeof g === "object" && !Array.isArray(g) ? (g as Record<string, boolean[]>) : {};
}

export function gateCleared(gate: DispoGate, checks: Record<string, boolean[]>): boolean {
  const arr = checks[gate.key] ?? [];
  return gate.checks.every((_, i) => !!arr[i]);
}

export function gateProgress(gate: DispoGate, checks: Record<string, boolean[]>): { done: number; total: number } {
  const arr = checks[gate.key] ?? [];
  return { done: gate.checks.filter((_, i) => !!arr[i]).length, total: gate.checks.length };
}

/** The gate that guards leaving the deal's CURRENT stage (null = no gate here). */
export function gateForCurrentStage(type: DealType, pipelineStages: Stage[], currentStage: string): DispoGate | null {
  const fwd = forwardStages(pipelineStages);
  const idx = fwd.findIndex((s) => s.key === currentStage);
  if (idx < 0) return null; // on a side stage → no forward gate
  return GATE_PATHS[type][idx] ?? null;
}

/** Enforcement: is moving this deal from `currentStage` to `targetStage` blocked by
 *  an uncleared gate? Forward only — backward / side-stage moves are always allowed. */
export function stageMoveBlocked(
  type: DealType,
  pipelineStages: Stage[],
  currentStage: string,
  targetStage: string,
  checks: Record<string, boolean[]>,
): { blocked: boolean; gate?: DispoGate; nextStage?: string } {
  const fwd = forwardStages(pipelineStages);
  const curIdx = fwd.findIndex((s) => s.key === currentStage);
  const tgtIdx = fwd.findIndex((s) => s.key === targetStage);
  if (tgtIdx < 0 || curIdx < 0) return { blocked: false }; // moving onto a side stage, or from one
  if (tgtIdx <= curIdx) return { blocked: false }; // backward / same
  const path = GATE_PATHS[type];
  // every forward stage we're leaving (curIdx .. tgtIdx-1) must have its gate cleared
  for (let i = curIdx; i < tgtIdx; i++) {
    const g = path[i];
    if (g && !gateCleared(g, checks)) return { blocked: true, gate: g, nextStage: fwd[i + 1]?.key };
  }
  return { blocked: false };
}
