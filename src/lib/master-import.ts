// 🔀 Import the MASTER unvetted-buyer list into the CRM kanban (Jon 2026-10-22).
// P1 (John Duong buyers) → DS: Developers "🔥 Hot"; P2–P4 → "🆕 New / to research".
// Checks each against what's already in the kanban AND Buyer Research (by name/phone)
// so nothing double-imports. Dry-run first, then ?mode=go. Server-only (Jon triggers).
import { db } from "@/lib/db";
import { MASTER_BUYERS, type MasterBuyer } from "@/lib/master-buyers-data";

// Tight match key: strip punctuation + ONLY the trailing entity suffix, so distinct
// builder names don't collapse (the old key over-stripped and false-matched everyone).
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(llc|inc|corp|corporation|co|ltd)\b/g, "").replace(/\s+/g, " ").trim();
const phone10 = (s: string) => s.replace(/\(.*$/, "").replace(/\D/g, "").slice(-10);
const isAgent = (t: string) => /realtor|agent|broker|wholesaler/i.test(t);
const parsePrice = (s: string) => { const m = s.match(/\$[\d,]+(?:\s*[–-]\s*\$?[\d,]+)?\s*[kmKM]?/); return m ? m[0] : ""; };

export type MasterPlan = {
  total: number; createdHot: number; createdNew: number; movedToHot: number;
  alreadyHave: number; skippedNoName: number; executed: boolean;
  samples: { name: string; priority: string; action: string }[]; note: string;
};

export async function importMaster(execute: boolean): Promise<MasterPlan> {
  const { resolveNetworkPipelines } = await import("@/lib/dispo-network");
  const net = await resolveNetworkPipelines();
  const devPipe = net.dev[0] || "DS: Developers";
  const agentPipe = net.agent[0] || "DS: Buyer Agents";

  // existing kanban opps (the kanban now holds unvetted + the migrated vetted buyers)
  const kanban = await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: net.all.length ? net.all : [devPipe, agentPipe] } },
    select: { id: true, stage: true, contactId: true, contact: { select: { name: true, phone: true } } },
  }).catch(() => []);
  const byName = new Map<string, typeof kanban[number]>();
  const byPhone = new Map<string, typeof kanban[number]>();
  for (const o of kanban) {
    const nk = norm(o.contact?.name ?? ""); if (nk && !byName.has(nk)) byName.set(nk, o);
    const p = phone10(o.contact?.phone ?? ""); if (p.length === 10 && !byPhone.has(p)) byPhone.set(p, o);
  }

  const plan: MasterPlan = { total: MASTER_BUYERS.length, createdHot: 0, createdNew: 0, movedToHot: 0, alreadyHave: 0, skippedNoName: 0, executed: execute, samples: [], note: "" };
  const usedNames = new Set<string>(); const usedPhones = new Set<string>();

  for (const b of MASTER_BUYERS as MasterBuyer[]) {
    if (!b.name.trim()) { plan.skippedNoName++; continue; }
    const nk = norm(b.name); const p10 = phone10(b.phone);
    const existing = (p10.length === 10 ? byPhone.get(p10) : undefined) ?? (nk ? byName.get(nk) : undefined);
    const isP1 = b.p === "P1";

    if (existing) {
      // already in the system. P1 → make sure it's in the Hot stage; others leave alone.
      if (isP1 && existing.stage !== "hot") {
        plan.movedToHot++;
        if (plan.samples.length < 14) plan.samples.push({ name: b.name, priority: b.p, action: "move → 🔥 Hot" });
        if (execute) await db.crmOpportunity.update({ where: { id: existing.id }, data: { stage: "hot" } }).catch(() => {});
      } else {
        plan.alreadyHave++;
      }
      continue;
    }
    // genuinely new (after tightened matching). Within-batch dedup too.
    if ((nk && usedNames.has(nk)) || (p10.length === 10 && usedPhones.has(p10))) { plan.alreadyHave++; continue; }
    if (nk) usedNames.add(nk); if (p10.length === 10) usedPhones.add(p10);

    const agent = isAgent(b.type);
    const stage = isP1 ? "hot" : "new";
    if (isP1) plan.createdHot++; else plan.createdNew++;
    if (plan.samples.length < 14) plan.samples.push({ name: b.name, priority: b.p, action: `create → ${isP1 ? "🔥 Hot" : "🆕 New"}` });

    if (execute) {
      const phoneE164 = p10.length === 10 ? `+1${p10}` : "";
      const contact = await db.crmContact.create({ data: { name: b.name, phone: phoneE164, email: b.email, address: "", source: b.src || "Master buyer list" } });
      const box = agent
        ? { areas: b.markets, priceRange: parsePrice(b.box), buyerTypes: b.type, bestContact: b.phone2, notes: b.box }
        : { buyCounties: b.markets, priceRange: parsePrice(b.box), requirements: b.box, proofOfFunds: isP1 || b.p === "P2" ? "Proven cash buyer (deed records)" : "" };
      await db.crmOpportunity.create({ data: {
        title: b.name, pipeline: agent ? agentPipe : devPipe, stage, contactId: contact.id, assignedTo: "",
        formData: { [agent ? "agent_profile" : "dev_buybox"]: box, __fromMaster: b.p, __import: { market: b.markets, buyBox: b.box } } as never,
      } });
      const bits = [b.box && `Buy box: ${b.box}`, b.notes && `Notes: ${b.notes}`, b.website && `Web: ${b.website}`, b.src && `Source: ${b.src}`].filter(Boolean).join(" · ");
      if (bits) await db.crmEvent.create({ data: { contactId: contact.id, kind: "note", body: `📇 ${b.p} buyer (master list). ${bits}`.slice(0, 1800), actor: "master-import" } }).catch(() => {});
    }
  }
  const acting = `${plan.createdHot} new → 🔥 Hot, ${plan.movedToHot} existing moved → 🔥 Hot, ${plan.createdNew} new → 🆕 New`;
  plan.note = execute
    ? `Done. ${acting}. ${plan.alreadyHave} already in place (no change).`
    : `DRY RUN — ${acting}. ${plan.alreadyHave} already in place (no change). Add ?mode=go to apply.`;
  return plan;
}
