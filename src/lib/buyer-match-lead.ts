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

export type NetworkMatch = { oppId: string; name: string; phone: string; kind: "developer" | "buyer_agent"; area: string; reason: string; score: number };

// 🎯 Smart Match from the buyer-NETWORK CRM (developers + buyer agents) for a deal
// (Jon 2026-10-20). Scores each network lead by how much its buy-area overlaps the
// deal's address/county, so a Sell-Land-Then-Sign deal auto-shows the most likely
// buyers to attach — no opening the cascade, no copying. Best-effort; never throws.
export async function getNetworkMatchesForDeal(address: string, limit = 8): Promise<NetworkMatch[]> {
  if (!address?.trim()) return [];
  try {
    const { DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE } = await import("@/lib/dispo-buyers");
    const opps = await db.crmOpportunity.findMany({
      where: { archivedAt: null, pipeline: { in: [DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE] } },
      select: { id: true, title: true, pipeline: true, formData: true, contact: { select: { name: true, phone: true } } },
    });
    const STOP = new Set(["the", "and", "for", "llc", "inc", "ave", "street", "road", "drive", "lane", "blvd", "court", "circle", "unit", "ste"]);
    const tokens = [...new Set(address.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOP.has(t)))];
    const scored = opps.map((o) => {
      const fd = (o.formData ?? {}) as Record<string, Record<string, string> & { market?: string; buyBox?: string }>;
      const imp = (fd.__import ?? {}) as { market?: string; buyBox?: string };
      const form = (fd.dev_buybox ?? fd.agent_profile ?? {}) as Record<string, string>;
      const areaText = `${imp.market ?? ""} ${form.buyCounties ?? ""} ${form.areas ?? ""} ${imp.buyBox ?? ""}`.toLowerCase();
      const hits = tokens.filter((t) => areaText.includes(t));
      return {
        oppId: o.id, name: o.contact?.name || o.title, phone: o.contact?.phone || "",
        kind: (o.pipeline === DISPO_AGENT_PIPELINE ? "buyer_agent" : "developer") as NetworkMatch["kind"],
        area: imp.market || form.buyCounties || form.areas || "",
        reason: hits.length ? `📍 ${hits.slice(0, 3).join(", ")}` : "",
        score: hits.length,
      };
    }).filter((m) => m.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    return scored;
  } catch {
    return [];
  }
}

export type LeadDeal = { dealOppId: string; dealAddr: string; stage: string; price?: string; lastContact?: string; nextFollowUp?: string };

// 🔗 Reverse link (Jon 2026-10-21): every DEAL a buyer agent / developer is attached
// to, with when we last talked + what they offered + next follow-up — so the agent's
// OWN card is the one place to see all their deal activity. Best-effort; never throws.
export async function getDealsForNetworkLead(leadOppId: string): Promise<LeadDeal[]> {
  if (!leadOppId) return [];
  try {
    const { isDispoDealPipeline, readDispoBuyers } = await import("@/lib/dispo-buyers");
    const { readPipelines } = await import("@/lib/crm");
    const { formatAddress } = await import("@/lib/address");
    const dealNames = (await readPipelines()).filter((p) => isDispoDealPipeline(p.name)).map((p) => p.name);
    if (!dealNames.length) return [];
    const opps = await db.crmOpportunity.findMany({
      where: { archivedAt: null, pipeline: { in: dealNames } },
      select: { id: true, title: true, updatedAt: true, formData: true, contact: { select: { address: true, name: true } } },
    });
    const out: LeadDeal[] = [];
    for (const o of opps) {
      for (const b of readDispoBuyers(o.formData)) {
        if (b.buyerId === leadOppId) {
          out.push({
            dealOppId: o.id,
            dealAddr: formatAddress(o.contact?.address || "") || o.title || o.contact?.name || "deal",
            stage: b.stage, price: b.price, lastContact: b.lastContact, nextFollowUp: b.nextFollowUp,
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}
