// 🔀 Phase 3 of the consolidation (Jon 2026-10-23): map a CRM-kanban developer/agent
// (CrmOpportunity in the DS pipelines, buy-box in formData) into the SAME CardBuyer /
// Scorecard shape the Vetted Buyers page already renders — so that page can read the
// kanban (the single source of truth) without rewriting its UI. Server-safe helper.
import { buildScorecard } from "./scorecard";
import { classifyBuilderSize } from "@/lib/builder-size";
import type { CardBuyer } from "@/components/BuyerCards";
import type { BuyerLand } from "@/lib/buyer-land";

export type CrmBuyerOpp = {
  id: string; stage: string | null; formData: unknown;
  contact: { name: string | null; phone: string | null; email: string | null } | null;
};
export type CrmTouch = { at: string; outcome?: string; note?: string };

const s = (v: unknown): string => (v == null ? "" : Array.isArray(v) ? v.map(String).join(", ") : String(v)).trim();

/** One kanban buyer opp → a CardBuyer (runs it through the existing scorecard). */
export function crmOppToCardBuyer(o: CrmBuyerOpp, touches: CrmTouch[], today: string): CardBuyer {
  const fd = (o.formData ?? {}) as Record<string, Record<string, unknown>> & { __import?: { market?: string } };
  const dev = fd.dev_buybox ?? {}; const ag = fd.agent_profile ?? {};
  const isAgent = !!fd.agent_profile && !fd.dev_buybox;
  const areas = s(dev.buyCounties) || s(ag.areas);
  const land: BuyerLand = {
    buyCounties: areas || undefined,
    landTypes: s(dev.landTypes) || undefined,
    closeSpeed: s(dev.closeSpeed) || undefined,
    lotsPerYear: (() => { const m = s(dev.volume).match(/\d+/); return m ? Number(m[0]) : undefined; })(),
  };
  const pof = /\byes\b|verified|proven|pof|funds/i.test(s(dev.proofOfFunds));
  const priceRange = s(dev.priceRange) || s(ag.priceRange);
  const sc = buildScorecard({
    id: o.id, name: o.contact?.name || "Buyer",
    company: s(ag.brokerage),
    type: isAgent ? "agent" : "developer",
    market: s(fd.__import?.market),
    buyBoxAreas: areas,
    dealType: s(dev.landTypes) || s(ag.buyerTypes),
    priceRange,
    minLotSize: s(dev.lotSize),
    closingSpeed: s(dev.closeSpeed),
    decisionMaker: s(dev.decisionMaker),
    bestContact: s(ag.bestContact),
    phone: o.contact?.phone || "",
    email: o.contact?.email || "",
    land,
    terms: { pof, whatTheyPay: priceRange || undefined },
    touches,
    lastContacted: touches[0]?.at,
    blacklisted: false,
  }, today);
  // 🏠🏢 only developers get a builder-size tag (agents aren't builders) — manual override wins.
  const builderSize = isAgent ? undefined : classifyBuilderSize({
    name: o.contact?.name || s(ag.brokerage),
    override: s(fd.__builderSize) || null,
    volumeText: s(dev.volume),
    extraText: `${areas} ${s(dev.landTypes)}`,
  });
  return { ...sc, company: s(ag.brokerage) || undefined, type: isAgent ? "agent" : "developer", phone: o.contact?.phone || undefined, email: o.contact?.email || undefined, bestContact: s(ag.bestContact) || undefined, builderSize };
}
