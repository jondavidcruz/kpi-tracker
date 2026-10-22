// 💰 Per-deal OFFERS-RECEIVED tracker (Jon 2026-10-22). Dispo already tracks WHO we
// sent a deal to (dispo-buyers), but had no record of the offers that come BACK —
// price, terms, days to close — and no way to enforce the "minimum 3 offers" goal.
// This stores the offers ON the deal (CrmOpportunity.formData.__dispoOffers) so no
// schema migration is needed. Pure + client-safe: types + read/stat helpers only.

export type DispoOfferStatus = "received" | "best" | "accepted" | "declined" | "dead";

export type DispoOffer = {
  id: string;
  buyer: string;            // who made the offer (free text, or a tracked buyer's name)
  buyerId?: string;         // link back to a network lead / tracked buyer, if known
  price: string;            // offer amount, as entered ("$145,000" / "145000")
  terms?: string;           // cash / assignment / novation / financing / EMD…
  daysToClose?: string;     // "14", "30" — number of days
  status: DispoOfferStatus;
  at?: string;              // YYYY-MM-DD received
  by?: string;              // who logged it
  notes?: string;
};

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

export type OfferStats = { total: number; live: number; met: boolean; best: number | null; bestBuyer: string };

/** Count LIVE offers (received/best/accepted) toward the goal; find the best price. */
export function offerStats(offers: DispoOffer[]): OfferStats {
  const live = offers.filter((o) => offerStatusMeta(o.status).live);
  let best: number | null = null;
  let bestBuyer = "";
  for (const o of live) { const p = parseMoney(o.price); if (p != null && (best == null || p > best)) { best = p; bestBuyer = o.buyer; } }
  return { total: offers.length, live: live.length, met: live.length >= OFFER_GOAL, best, bestBuyer };
}
