// 💰 Per-deal OFFERS-RECEIVED tracker (Jon 2026-10-22). Dispo already tracks WHO we
// sent a deal to (dispo-buyers), but had no record of the offers that come BACK —
// price, terms, days to close — and no way to enforce the "minimum 3 offers" goal.
// This stores the offers ON the deal (CrmOpportunity.formData.__dispoOffers) so no
// schema migration is needed. Pure + client-safe: types + read/stat helpers only.

export type DispoOfferStatus = "received" | "best" | "accepted" | "declined" | "dead";

export type DispoOfferType = "agent" | "direct" | "jv";

export type DispoOffer = {
  id: string;
  buyer: string;            // who made the offer (free text, or a tracked buyer's name)
  buyerId?: string;         // link back to a network lead / tracked buyer, if known
  price: string;            // offer amount, as entered ("$145,000" / "145000")
  terms?: string;           // cash / assignment / novation / financing / EMD…
  daysToClose?: string;     // "14", "30" — number of days
  status: DispoOfferStatus;
  offerType?: DispoOfferType; // who's on the other side (drives net math) — default "direct"
  splitPct?: number;        // JV wholesaler only: OUR share of the spread (%). Default 50.
  at?: string;              // YYYY-MM-DD received
  by?: string;              // who logged it
  notes?: string;
};

// Buyer type drives what we actually NET (Jon 2026-10-22):
//  • 🧑‍💼 Buyer Agent — a commission comes off the top (~10%), so we collect offer × (1 − 10%).
//  • 🏗 Direct Buyer — a true cash buyer who covers closing, so we collect the full offer.
//  • 🤝 JV Wholesaler — we split the spread with them; we keep our share (default 50%).
export const OFFER_TYPES: { key: DispoOfferType; label: string; emoji: string; takePct: number; blurb: string }[] = [
  { key: "direct", label: "Direct buyer", emoji: "🏗", takePct: 0, blurb: "Cash buyer, covers closing — we collect the full offer." },
  { key: "agent", label: "Buyer agent", emoji: "🧑‍💼", takePct: 10, blurb: "~10% commission off the top." },
  { key: "jv", label: "JV wholesaler", emoji: "🤝", takePct: 0, blurb: "Split the spread — we keep our share." },
];
export const DEFAULT_AGENT_PCT = 10;
export const DEFAULT_JV_SPLIT = 50;

export function offerTypeMeta(t: string | undefined) {
  return OFFER_TYPES.find((x) => x.key === t) ?? OFFER_TYPES[0];
}

export type OfferNet = { proceeds: number | null; profit: number | null; marginPct: number | null };

/** What we actually net on an offer given what we have the deal under contract at. */
export function offerNet(o: DispoOffer, underContract: number | null): OfferNet {
  const price = parseMoney(o.price);
  if (price == null) return { proceeds: null, profit: null, marginPct: null };
  const type = o.offerType ?? "direct";
  let proceeds: number;
  let profit: number | null = null;
  if (type === "jv") {
    // Split the spread; proceeds back to us = cost + our share of (offer − cost).
    const split = (o.splitPct ?? DEFAULT_JV_SPLIT) / 100;
    if (underContract == null) return { proceeds: null, profit: null, marginPct: null };
    profit = (price - underContract) * split;
    proceeds = underContract + profit;
  } else {
    const take = type === "agent" ? DEFAULT_AGENT_PCT / 100 : 0;
    proceeds = price * (1 - take);
    profit = underContract == null ? null : proceeds - underContract;
  }
  const marginPct = profit != null && price > 0 ? (profit / price) * 100 : null;
  return { proceeds: Math.round(proceeds), profit: profit == null ? null : Math.round(profit), marginPct };
}

/** What we have the deal under contract at (our cost), stored per-deal. */
export function readUnderContract(formData: unknown): number | null {
  const raw = (formData as Record<string, unknown> | null)?.__dispoUnderContract;
  return parseMoney(raw == null ? null : String(raw));
}

// The accountability number: a deal that's out should pull at least this many offers.
// Fewer than this at/after the cascade stage = dispo hasn't pushed hard enough.
export const OFFER_GOAL = 3;

export const OFFER_STATUSES: { key: DispoOfferStatus; label: string; cls: string; live: boolean }[] = [
  { key: "received", label: "Received", cls: "bg-sky-100 text-sky-700", live: true },
  { key: "best", label: "⭐ Best", cls: "bg-emerald-100 text-emerald-700", live: true },
  { key: "accepted", label: "✅ Accepted", cls: "bg-emerald-600 text-white", live: true },
  { key: "declined", label: "Declined", cls: "bg-slate-200 text-slate-500", live: false },
  { key: "dead", label: "Dead", cls: "bg-rose-100 text-rose-600", live: false },
];

export function offerStatusMeta(s: string) {
  return OFFER_STATUSES.find((x) => x.key === s) ?? OFFER_STATUSES[0];
}

/** Read + normalize the offers list off an opp's formData (never throws). */
export function readDispoOffers(formData: unknown): DispoOffer[] {
  const raw = (formData as Record<string, unknown> | null)?.__dispoOffers;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      id: String(r.id ?? ""),
      buyer: String(r.buyer ?? ""),
      buyerId: r.buyerId ? String(r.buyerId) : undefined,
      price: String(r.price ?? ""),
      terms: r.terms ? String(r.terms) : undefined,
      daysToClose: r.daysToClose ? String(r.daysToClose) : undefined,
      status: (OFFER_STATUSES.some((s) => s.key === r.status) ? r.status : "received") as DispoOfferStatus,
      offerType: (OFFER_TYPES.some((t) => t.key === r.offerType) ? r.offerType : undefined) as DispoOfferType | undefined,
      splitPct: Number.isFinite(Number(r.splitPct)) ? Number(r.splitPct) : undefined,
      at: r.at ? String(r.at) : undefined,
      by: r.by ? String(r.by) : undefined,
      notes: r.notes ? String(r.notes) : undefined,
    }))
    .filter((r) => r.id && r.buyer);
}

export function parseMoney(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "";
  return `$${Math.round(n).toLocaleString()}`;
}

export type OfferStats = { total: number; live: number; met: boolean; best: number | null; bestBuyer: string; bestId: string | null; bestNet: number | null };

/** Count LIVE offers toward the goal and find the BEST one. When we know what the deal is
 *  under contract at, "best" ranks by what we actually NET (Jon 2026-11-03); otherwise by
 *  gross price. `best` stays the gross price of that winning offer for the seller-handoff math. */
export function offerStats(offers: DispoOffer[], underContract: number | null = null): OfferStats {
  const live = offers.filter((o) => offerStatusMeta(o.status).live);
  let bestId: string | null = null;
  let bestRank = -Infinity; // net profit when known, else gross price
  let best: number | null = null;
  let bestNet: number | null = null;
  let bestBuyer = "";
  for (const o of live) {
    const p = parseMoney(o.price);
    if (p == null) continue;
    const net = underContract != null ? offerNet(o, underContract).profit : null;
    const rank = net ?? p;
    if (rank > bestRank) { bestRank = rank; bestId = o.id; best = p; bestNet = net; bestBuyer = o.buyer; }
  }
  return { total: offers.length, live: live.length, met: live.length >= OFFER_GOAL, best, bestBuyer, bestId, bestNet };
}
