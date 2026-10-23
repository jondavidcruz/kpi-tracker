// 🔀 Phase 2 of the buyer-system consolidation (Jon 2026-10-22): migrate the
// MarketContact buyers (Buyer Research + Vetted Buyers) INTO the CRM kanban as
// DS: Developers / DS: Buyer Agents opportunities, so there's ONE buyer store.
// Dry-run first (reports what would happen), then execute. Idempotent: each created
// opp carries formData.__fromMarketContact so a re-run skips already-migrated buyers.
// Server-only (imports db). Jon triggers this via the admin route — it is HIS write.
import { db } from "@/lib/db";

export type MigratePlan = {
  developers: number;
  agents: number;
  skippedMigrated: number;
  skippedDupe: number;
  totalSource: number;
  executed: boolean;
  created: number;
  samples: { name: string; kind: "developer" | "agent"; stage: string; box: string[] }[];
  note: string;
};

const has = (v: unknown) => v != null && String(v).trim().length > 0;
const str = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v)).trim();

function devStage(vetStage: string): string {
  switch (vetStage) {
    case "vetted": case "active": return "vetted";
    case "hold": return "following_up";
    case "dead": return "not_fit";
    default: return "new";
  }
}
function agentStage(vetStage: string): string {
  switch (vetStage) {
    case "vetted": case "active": return "active";
    case "hold": return "following_up";
    case "dead": return "not_fit";
    default: return "new";
  }
}

type MC = { id: string; name: string; type: string; category: string; phone: string; phone2: string; email: string;
  company: string; market: string; buyBoxAreas: string; buyBox: string; priceRange: string; minLotSize: string;
  dealType: string; closingSpeed: string; decisionMaker: string; bestContact: string; vetStage: string; region: string; igHandle: string; contact: string; };
type Land = { buyCounties?: string; buyCities?: string; buyStates?: string; landTypes?: string[] | string; lotMin?: number; lotMax?: number; priceMin?: number; priceMax?: number; pricePerLot?: number; closeSpeed?: string; lotsPerYear?: number; targetZips?: string };
type Terms = { pof?: boolean; maxOfferPct?: number; whatTheyPay?: string };

/** Build the CRM buy-box formData block for one MarketContact. */
function buildBox(mc: MC, land: Land | undefined, terms: Terms | undefined, isAgent: boolean): { formKey: string; box: Record<string, unknown> } {
  const l = land ?? {}; const t = terms ?? {};
  const price = str(mc.priceRange) || t.whatTheyPay || (l.priceMin || l.priceMax ? `$${l.priceMin ?? "?"}–$${l.priceMax ?? "?"}` : l.pricePerLot ? `$${l.pricePerLot}/lot` : "");
  const areas = str(l.buyCounties) || str(mc.buyBoxAreas) || str(mc.market) || str(mc.region);
  if (isAgent) {
    return { formKey: "agent_profile", box: {
      areas,
      priceRange: price,
      buyerTypes: str(mc.dealType) || str(mc.buyBox),
      brokerage: str(mc.company),
      bestContact: str(mc.bestContact),
      notes: str(mc.buyBox),
    } };
  }
  return { formKey: "dev_buybox", box: {
    buyCounties: areas,
    priceRange: price,
    landTypes: Array.isArray(l.landTypes) ? l.landTypes : str(l.landTypes) || str(mc.dealType),
    lotSize: str(mc.minLotSize) || (l.lotMin || l.lotMax ? `${l.lotMin ?? "?"}–${l.lotMax ?? "?"} ac` : ""),
    closeSpeed: str(mc.closingSpeed) || str(l.closeSpeed),
    volume: l.lotsPerYear ? `${l.lotsPerYear}/yr` : "",
    requirements: str(mc.buyBox),
    decisionMaker: str(mc.decisionMaker) || str(mc.bestContact),
    proofOfFunds: t.pof ? "Yes — verified" : "",
  } };
}

export async function migrateBuyers(execute: boolean): Promise<MigratePlan> {
  const { resolveNetworkPipelines } = await import("@/lib/dispo-network");
  const net = await resolveNetworkPipelines();
  const devPipe = net.dev[0] || "DS: Developers";
  const agentPipe = net.agent[0] || "DS: Buyer Agents";

  const [rows, landRow, termsRow, existingOpps] = await Promise.all([
    db.marketContact.findMany({ where: { archivedAt: null, type: { not: "jv_partner" } }, orderBy: { name: "asc" } }),
    db.resource.findFirst({ where: { category: "__buyer_land__" } }),
    db.resource.findFirst({ where: { category: "__buyer_terms__" } }),
    db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: net.all.length ? net.all : [devPipe, agentPipe] } }, select: { formData: true, contactId: true, contact: { select: { name: true, phone: true } } } }),
  ]);
  let land: Record<string, Land> = {}; try { land = JSON.parse(landRow?.description || "{}"); } catch { /* none */ }
  let terms: Record<string, Terms> = {}; try { terms = JSON.parse(termsRow?.description || "{}"); } catch { /* none */ }

  // dedup sets from what's already in the DS pipelines
  const migratedFrom = new Set<string>();
  const existingNames = new Set<string>();
  const existingPhones = new Set<string>();
  for (const o of existingOpps) {
    const fm = (o.formData as { __fromMarketContact?: string } | null)?.__fromMarketContact;
    if (fm) migratedFrom.add(fm);
    if (o.contact?.name) existingNames.add(o.contact.name.trim().toLowerCase());
    const p10 = (o.contact?.phone ?? "").replace(/\D/g, "").slice(-10);
    if (p10.length === 10) existingPhones.add(p10);
  }

  const plan: MigratePlan = { developers: 0, agents: 0, skippedMigrated: 0, skippedDupe: 0, totalSource: rows.length, executed: execute, created: 0, samples: [], note: "" };

  for (const mc of rows as unknown as MC[]) {
    if (migratedFrom.has(mc.id)) { plan.skippedMigrated++; continue; }
    const isAgent = mc.type === "agent";
    const nameKey = (mc.name ?? "").trim().toLowerCase();
    const p10 = (mc.phone ?? "").replace(/\D/g, "").slice(-10);
    if ((nameKey && existingNames.has(nameKey)) || (p10.length === 10 && existingPhones.has(p10))) { plan.skippedDupe++; continue; }

    const { formKey, box } = buildBox(mc, land[mc.id], terms[mc.id], isAgent);
    const pipeline = isAgent ? agentPipe : devPipe;
    const stage = isAgent ? agentStage(mc.vetStage) : devStage(mc.vetStage);
    if (isAgent) plan.agents++; else plan.developers++;
    if (plan.samples.length < 12) plan.samples.push({ name: mc.name, kind: isAgent ? "agent" : "developer", stage, box: Object.entries(box).filter(([, v]) => has(v)).map(([k]) => k) });

    if (execute) {
      const phoneE164 = p10.length === 10 ? `+1${p10}` : (mc.phone ?? "").replace(/[^+\d]/g, "");
      // reuse an existing contact by phone, else create one
      const contact = (p10.length === 10
        ? await db.crmContact.findFirst({ where: { archivedAt: null, OR: [{ phone: { endsWith: p10 } }, { altPhone: { endsWith: p10 } }] }, orderBy: { updatedAt: "desc" } }).catch(() => null)
        : null)
        ?? await db.crmContact.create({ data: { name: mc.name, phone: phoneE164, email: str(mc.email), source: "Buyer Research (migrated)", address: "" } });
      await db.crmOpportunity.create({ data: {
        title: mc.name, pipeline, stage, contactId: contact.id, assignedTo: "",
        formData: { [formKey]: box, __fromMarketContact: mc.id, __import: { market: str(mc.market) || str(mc.region), buyBox: str(mc.buyBox) } } as never,
      } });
      existingNames.add(nameKey); if (p10.length === 10) existingPhones.add(p10);
      plan.created++;
    }
  }

  plan.note = execute
    ? `Migrated ${plan.created} buyers into the CRM kanban (${plan.developers} developers → ${devPipe}, ${plan.agents} agents → ${agentPipe}). Skipped ${plan.skippedMigrated} already-migrated + ${plan.skippedDupe} duplicates.`
    : `DRY RUN — would create ${plan.developers} developers + ${plan.agents} agents. ${plan.skippedMigrated} already migrated, ${plan.skippedDupe} look like duplicates (same name/phone already in the kanban). Add ?mode=go to execute.`;
  return plan;
}
