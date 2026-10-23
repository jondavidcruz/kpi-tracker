// 🔀 Import the MASTER unvetted-buyer list into the CRM kanban (Jon 2026-10-22).
// P1 (John Duong buyers) → DS: Developers "🔥 Hot"; P2–P4 → "🆕 New / to research".
// Checks each against what's already in the kanban AND Buyer Research (by name/phone)
// so nothing double-imports. Dry-run first, then ?mode=go. Server-only (Jon triggers).
import { db } from "@/lib/db";
import { MASTER_BUYERS, type MasterBuyer } from "@/lib/master-buyers-data";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\b(llc|inc|corp|corporation|co|ltd|company|group|homes|builders|construction|capital|invest|investments|ventures|development|consulting|services|properties|realty|the)\b/g, "").replace(/\s+/g, " ").trim();
const phone10 = (s: string) => s.replace(/\(.*$/, "").replace(/\D/g, "").slice(-10);
const isAgent = (t: string) => /realtor|agent|broker|wholesaler/i.test(t);
const parsePrice = (s: string) => { const m = s.match(/\$[\d,]+(?:\s*[–-]\s*\$?[\d,]+)?\s*[kmKM]?/); return m ? m[0] : ""; };

export type MasterPlan = {
  total: number; toCreateHot: number; toCreateNew: number; developers: number; agents: number;
  alreadyHave: number; skippedNoName: number; executed: boolean; created: number;
  samples: { name: string; priority: string; stage: string; kind: string }[]; note: string;
};

export async function importMaster(execute: boolean): Promise<MasterPlan> {
  const { resolveNetworkPipelines } = await import("@/lib/dispo-network");
  const net = await resolveNetworkPipelines();
  const devPipe = net.dev[0] || "DS: Developers";
  const agentPipe = net.agent[0] || "DS: Buyer Agents";

  const [kanban, mcs] = await Promise.all([
    db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: net.all.length ? net.all : [devPipe, agentPipe] } }, select: { contact: { select: { name: true, phone: true } } } }).catch(() => []),
    db.marketContact.findMany({ where: { archivedAt: null }, select: { name: true, phone: true } }).catch(() => []),
  ]);
  const names = new Set<string>(); const phones = new Set<string>();
  const seed = (name?: string | null, phone?: string | null) => { if (name) { const k = norm(name); if (k) names.add(k); } const p = phone10(phone ?? ""); if (p.length === 10) phones.add(p); };
  for (const o of kanban) seed(o.contact?.name, o.contact?.phone);
  for (const m of mcs) seed(m.name, m.phone);

  const plan: MasterPlan = { total: MASTER_BUYERS.length, toCreateHot: 0, toCreateNew: 0, developers: 0, agents: 0, alreadyHave: 0, skippedNoName: 0, executed: execute, created: 0, samples: [], note: "" };

  for (const b of MASTER_BUYERS as MasterBuyer[]) {
    if (!b.name.trim()) { plan.skippedNoName++; continue; }
    const nk = norm(b.name); const p10 = phone10(b.phone);
    if ((nk && names.has(nk)) || (p10.length === 10 && phones.has(p10))) { plan.alreadyHave++; continue; }
    if (nk) names.add(nk); if (p10.length === 10) phones.add(p10); // reserve (within-batch dedup)

    const agent = isAgent(b.type);
    const pipeline = agent ? agentPipe : devPipe;
    const stage = b.p === "P1" ? "hot" : "new";
    if (stage === "hot") plan.toCreateHot++; else plan.toCreateNew++;
    if (agent) plan.agents++; else plan.developers++;
    if (plan.samples.length < 12) plan.samples.push({ name: b.name, priority: b.p, stage, kind: agent ? "agent" : "developer" });

    if (execute) {
      const phoneE164 = p10.length === 10 ? `+1${p10}` : "";
      const contact = (p10.length === 10
        ? await db.crmContact.findFirst({ where: { archivedAt: null, OR: [{ phone: { endsWith: p10 } }, { altPhone: { endsWith: p10 } }] }, orderBy: { updatedAt: "desc" } }).catch(() => null)
        : null)
        ?? await db.crmContact.create({ data: { name: b.name, phone: phoneE164, email: b.email, address: "", source: b.src || "Master buyer list" } });
      const box = agent
        ? { areas: b.markets, priceRange: parsePrice(b.box), buyerTypes: b.type, brokerage: "", bestContact: b.phone2, notes: b.box }
        : { buyCounties: b.markets, priceRange: parsePrice(b.box), landTypes: "", requirements: b.box, volume: "", decisionMaker: "", closeSpeed: "", proofOfFunds: b.p === "P1" || b.p === "P2" ? "Proven cash buyer (deed records)" : "" };
      await db.crmOpportunity.create({ data: {
        title: b.name, pipeline, stage, contactId: contact.id, assignedTo: "",
        formData: { [agent ? "agent_profile" : "dev_buybox"]: box, __fromMaster: b.p, __import: { market: b.markets, buyBox: b.box } } as never,
      } });
      const bits = [b.box && `Buy box: ${b.box}`, b.notes && `Notes: ${b.notes}`, b.website && `Web: ${b.website}`, b.src && `Source: ${b.src}`].filter(Boolean).join(" · ");
      if (bits) await db.crmEvent.create({ data: { contactId: contact.id, kind: "note", body: `📇 ${b.p} buyer (master list). ${bits}`.slice(0, 1800), actor: "master-import" } }).catch(() => {});
      plan.created++;
    }
  }
  plan.note = execute
    ? `Imported ${plan.created} buyers (${plan.toCreateHot} → 🔥 Hot, ${plan.toCreateNew} → 🆕 New). ${plan.alreadyHave} already in the system (kanban or Buyer Research).`
    : `DRY RUN — would add ${plan.toCreateHot + plan.toCreateNew} (${plan.toCreateHot} P1 → 🔥 Hot, ${plan.toCreateNew} → 🆕 New; ${plan.developers} developers, ${plan.agents} agents). ${plan.alreadyHave} already in the system. Add ?mode=go. (Run /api/admin/add-dev-hot-stage first.)`;
  return plan;
}
