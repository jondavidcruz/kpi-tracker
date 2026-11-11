// ⚖️ Wholesaling-law ORIENTATION by state (Jon 2026-11-11) — a quick "is this state easy or hard to
// wholesale in" read so we don't waste pulls in attorney-heavy / restricted states (e.g. SC & NC).
// This is GENERAL ORIENTATION, not legal advice — always confirm with a licensed attorney in the
// state before working a deal. Ratings reflect how wholesaler-friendly the closing + licensing
// landscape generally is, as of 2025; laws change.
export type WholesaleRating = "friendly" | "caution" | "hard";

export type StateLaw = {
  code: string; name: string;
  rating: WholesaleRating;
  attorneyState: boolean;   // closing legally requires / customarily uses a real-estate attorney
  closing: string;          // how deals close
  license: string;          // licensing exposure for wholesalers
  disclosure: string;       // what you must disclose
  verdict: string;          // one-line takeaway
};

// Ordered best→worst within the states we touch or might (FL land core + cash-buyer states + the SE).
export const WHOLESALE_LAW: StateLaw[] = [
  { code: "FL", name: "Florida", rating: "friendly", attorneyState: false,
    closing: "Title/escrow company (no attorney required)",
    license: "No license needed to assign a contract. Don't market the PROPERTY itself unlicensed — market YOUR contract.",
    disclosure: "Best practice: disclose you hold an equitable/contract interest, not title.",
    verdict: "🟢 Home base — easy to wholesale; title-company closings." },
  { code: "TX", name: "Texas", rating: "friendly", attorneyState: false,
    closing: "Title company (escrow state)",
    license: "Legal without a license IF you sell the contract, not the property.",
    disclosure: "REQUIRED: written disclosure (§1101.0045) that you're selling your interest in a contract, not the property itself. Put it in the ad + the contract.",
    verdict: "🟢 Friendly — just always disclose you're assigning a contract." },
  { code: "AZ", name: "Arizona", rating: "friendly", attorneyState: false,
    closing: "Title/escrow company",
    license: "No license to assign; market the contract, not the property.",
    disclosure: "Disclose equitable interest; keep it contract-based.",
    verdict: "🟢 Friendly escrow state — clean assignments." },
  { code: "TN", name: "Tennessee", rating: "friendly", attorneyState: false,
    closing: "Title company (attorney optional)",
    license: "Legal; TREC says market the CONTRACT, not the property, if unlicensed.",
    disclosure: "Disclose equitable interest; avoid advertising the property itself.",
    verdict: "🟢 Workable — market your contract, not the house/lot." },
  { code: "CO", name: "Colorado", rating: "friendly", attorneyState: false,
    closing: "Title/escrow company",
    license: "No license to assign; contract-based marketing only.",
    disclosure: "Disclose equitable interest.",
    verdict: "🟢 Friendly escrow state." },
  { code: "CA", name: "California", rating: "caution", attorneyState: false,
    closing: "Escrow company",
    license: "Legal but heavily regulated; can't advertise the property unlicensed — only your contract.",
    disclosure: "Disclose equitable interest; stricter marketing/advertising rules.",
    verdict: "🟡 Doable but regulated — keep marketing strictly contract-based." },
  { code: "GA", name: "Georgia", rating: "caution", attorneyState: true,
    closing: "ATTORNEY-closing state (lawyer must handle closing)",
    license: "Legal to wholesale, but the attorney-closing adds cost/time; double-close is common.",
    disclosure: "Disclose equitable interest; coordinate early with a closing attorney.",
    verdict: "🟡 Attorney state — workable, but plan for a closing attorney." },
  { code: "AL", name: "Alabama", rating: "caution", attorneyState: true,
    closing: "Attorney involvement customary",
    license: "Legal; attorney commonly handles closing.",
    disclosure: "Disclose equitable interest.",
    verdict: "🟡 Attorney-leaning — line up a closing attorney." },
  { code: "OK", name: "Oklahoma", rating: "caution", attorneyState: false,
    closing: "Title/escrow company",
    license: "⚠️ Oklahoma Predatory Real-Estate Wholesaler Prevention Act restricts unlicensed wholesaling — disclosure + limits apply (some provisions amended). Check current rules before working it.",
    disclosure: "Specific statutory disclosures required; treat carefully.",
    verdict: "🟡 Has a wholesaler-specific law — confirm current rules first." },
  { code: "MS", name: "Mississippi", rating: "caution", attorneyState: true,
    closing: "Attorney-closing customary",
    license: "Legal; attorney at closing.",
    disclosure: "Disclose equitable interest.",
    verdict: "🟡 Attorney state — plan accordingly." },
  { code: "NC", name: "North Carolina", rating: "hard", attorneyState: true,
    closing: "ATTORNEY-closing state (attorney must supervise closing)",
    license: "Unlicensed wholesaling is scrutinized — you can't broker someone else's property; equitable-interest line is tight.",
    disclosure: "Heavy disclosure expectations; attorney required at closing.",
    verdict: "🔴 Hard — attorney state + wholesaling scrutiny. Avoid unless set up for it." },
  { code: "SC", name: "South Carolina", rating: "hard", attorneyState: true,
    closing: "ATTORNEY-closing state (SC Supreme Court requires attorney-supervised closings)",
    license: "Attorney must run the closing; unlicensed wholesaling is harder to execute cleanly.",
    disclosure: "Heavy; attorney-supervised.",
    verdict: "🔴 Hard — attorney-supervised closings. The one you flagged — avoid." },
  { code: "IL", name: "Illinois", rating: "hard", attorneyState: true,
    closing: "Attorney-closing customary",
    license: "⚠️ License required to wholesale beyond a very small number of deals per year.",
    disclosure: "Strict; license exposure.",
    verdict: "🔴 Hard — license required past a deal or two. Avoid unlicensed." },
];

const BY_CODE: Record<string, StateLaw> = Object.fromEntries(WHOLESALE_LAW.map((s) => [s.code, s]));

/** Look up a state's wholesale-law read by 2-letter code (case-insensitive). */
export function lawForState(code?: string | null): StateLaw | undefined {
  if (!code) return undefined;
  return BY_CODE[code.trim().toUpperCase()];
}

export const RATING_META: Record<WholesaleRating, { dot: string; label: string; cls: string }> = {
  friendly: { dot: "🟢", label: "Friendly", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  caution: { dot: "🟡", label: "Caution", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  hard: { dot: "🔴", label: "Hard / avoid", cls: "bg-red-50 text-red-700 ring-red-200" },
};
