import { db } from "@/lib/db";
import { matchBuyersForDeal, type BuyerMatch, type MatchBuyer } from "@/lib/buyer-match";

// 🎯 Matching cash buyers for a LEAD (Jon 2026-10-20) — the same ranking the Deals
// board uses (matchBuyersForDeal: geography + price + terms), but runnable on a land
// lead still in the pipeline so dispo knows who to send it to BEFORE it's signed.
// Read-only, best-effort; never throws. Marketing-access only (gated by the caller).
export async function getBuyerMatchesForLead(address: string, price: number | null, leadFeatures: string[] = []): Promise<BuyerMatch[]> {
  if (!address?.trim()) return [];
  try {
    const buyers = await db.marketContact.findMany({
      where: { archivedAt: null, blacklistedAt: null, vetStage: { in: ["vetted", "active"] } },
      orderBy: { sortOrder: "asc" },
    });
    const { readBuyerTerms, readBuyerLand } = await import("@/app/actions");
    const [terms, buyerLand] = await Promise.all([
      readBuyerTerms().catch(() => ({} as Record<string, { pof?: boolean; maxOfferPct?: number }>)),
      readBuyerLand().catch(() => ({} as Record<string, { isLandBuyer?: boolean; targetZips?: string; featuresWanted?: string }>)),
    ]);
    const withTerms = buyers
      .filter((b) => b.type !== "jv_partner")
      .map((b) => ({ ...b, proofOfFunds: terms[b.id]?.pof, maxOfferPct: terms[b.id]?.maxOfferPct, isLandBuyer: buyerLand[b.id]?.isLandBuyer, targetZips: buyerLand[b.id]?.targetZips }));
    const matches = matchBuyersForDeal(address, price, withTerms as unknown as MatchBuyer[]);

    // 🏞 Feature-fit boost (Jon 2026-10-20): a buyer whose land buy-box WANTS a
    // feature this lead has (waterfront, road frontage…) jumps up the list.
    if (leadFeatures.length) {
      for (const m of matches) {
        const want = (buyerLand[m.id]?.featuresWanted || "").toLowerCase();
        if (!want) continue;
        const hits = leadFeatures.filter((f) => f && want.includes(f.toLowerCase()));
        if (hits.length) { m.score += 6 * hits.length; m.reasons.unshift(`🏞 wants ${hits[0].split(" / ")[0]}${hits.length > 1 ? ` +${hits.length - 1}` : ""}`); }
      }
      matches.sort((a, b) => b.score - a.score);
      matches.forEach((m, i) => { m.rank = i + 1; });
    }
    return matches.slice(0, 6);
  } catch {
    return [];
  }
}
