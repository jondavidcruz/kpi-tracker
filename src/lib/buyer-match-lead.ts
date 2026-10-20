import { db } from "@/lib/db";
import { matchBuyersForDeal, type BuyerMatch, type MatchBuyer } from "@/lib/buyer-match";

// 🎯 Matching cash buyers for a LEAD (Jon 2026-10-20) — the same ranking the Deals
// board uses (matchBuyersForDeal: geography + price + terms), but runnable on a land
// lead still in the pipeline so dispo knows who to send it to BEFORE it's signed.
// Read-only, best-effort; never throws. Marketing-access only (gated by the caller).
export async function getBuyerMatchesForLead(address: string, price: number | null): Promise<BuyerMatch[]> {
  if (!address?.trim()) return [];
  try {
    const buyers = await db.marketContact.findMany({
      where: { archivedAt: null, blacklistedAt: null, vetStage: { in: ["vetted", "active"] } },
      orderBy: { sortOrder: "asc" },
    });
    const { readBuyerTerms, readBuyerLand } = await import("@/app/actions");
    const [terms, buyerLand] = await Promise.all([
      readBuyerTerms().catch(() => ({} as Record<string, { pof?: boolean; maxOfferPct?: number }>)),
      readBuyerLand().catch(() => ({} as Record<string, { isLandBuyer?: boolean; targetZips?: string }>)),
    ]);
    const withTerms = buyers
      .filter((b) => b.type !== "jv_partner")
      .map((b) => ({ ...b, proofOfFunds: terms[b.id]?.pof, maxOfferPct: terms[b.id]?.maxOfferPct, isLandBuyer: buyerLand[b.id]?.isLandBuyer, targetZips: buyerLand[b.id]?.targetZips }));
    return matchBuyersForDeal(address, price, withTerms as unknown as MatchBuyer[]).slice(0, 6);
  } catch {
    return [];
  }
}
