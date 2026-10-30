// 🏗 Create a developer / buyer-agent lead in the dispo NETWORK kanban (DS: Developers /
// DS: Buyer Agents) — the single home for buyers now (Jon 2026-10-27: nightly research goes to
// the unvetted-developers kanban, not Buyer Research). Server-only (Prisma). Dedupes by phone/
// email, lands new cards at the "new" (🆕 New / to research) stage, never duplicates an open card.
import "server-only";
import { db } from "./db";
import { logCrmEvent } from "./crm";

export type NetworkLeadIn = {
  name: string; phone?: string; email?: string; kind: "developer" | "agent";
  market?: string; buyBox?: string; notes?: string; source?: string; actor?: string;
  // 🧩 enrichment (Jon 2026-10-30): company + up to a 2nd/3rd phone & email so the DirectREI
  // export has Company / Email 1-3 / Phone 1-3 filled.
  company?: string; phone2?: string; phone3?: string; email2?: string; email3?: string;
};

export async function upsertNetworkLead(o: NetworkLeadIn): Promise<{ created: boolean; oppId: string; name: string; phone: string; email: string } | null> {
  const name = (o.name ?? "").trim();
  if (!name) return null;
  const { DISPO_NETWORK_PIPELINES, DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE, isDevNetworkName, isAgentNetworkName } = await import("./dispo-buyers");
  const toAgent = o.kind === "agent";
  const actor = o.actor ?? "buyer-miner";

  // resolve the live pipeline name (tolerant of renames), creating it only if it's missing
  const PIPES_CAT = "__crm_pipelines__";
  const pRow = await db.resource.findFirst({ where: { category: PIPES_CAT } }).catch(() => null);
  let ghl: Array<{ name: string; stages: Array<{ key: string; label: string }> }> = [];
  try { ghl = pRow?.description ? JSON.parse(pRow.description) : []; } catch { ghl = []; }
  const pipeline = toAgent
    ? (ghl.find((p) => isAgentNetworkName(p.name))?.name ?? DISPO_AGENT_PIPELINE)
    : (ghl.find((p) => isDevNetworkName(p.name))?.name ?? DISPO_DEV_PIPELINE);
  const exists = toAgent ? ghl.some((p) => isAgentNetworkName(p.name)) : ghl.some((p) => isDevNetworkName(p.name));
  if (!exists) {
    const np = DISPO_NETWORK_PIPELINES.find((p) => (toAgent ? isAgentNetworkName(p.name) : isDevNetworkName(p.name)));
    if (np) {
      ghl.push({ name: np.name, stages: np.stages });
      if (pRow) await db.resource.update({ where: { id: pRow.id }, data: { description: JSON.stringify(ghl) } }).catch(() => {});
      else await db.resource.create({ data: { title: "crm-pipelines", category: PIPES_CAT, url: "", description: JSON.stringify(ghl) } }).catch(() => {});
    }
  }

  const phone = (o.phone ?? "").trim();
  const email = (o.email ?? "").trim();
  const p10 = phone.replace(/\D/g, "").slice(-10);
  const existing = p10.length === 10
    ? await db.crmContact.findFirst({ where: { archivedAt: null, OR: [{ phone: { endsWith: p10 } }, { altPhone: { endsWith: p10 } }] }, orderBy: { updatedAt: "desc" } }).catch(() => null)
    : (email ? await db.crmContact.findFirst({ where: { archivedAt: null, email: { equals: email, mode: "insensitive" } } }).catch(() => null) : null);

  const contact = existing ?? await db.crmContact.create({ data: {
    name, phone, email, source: o.source ?? "Nightly research",
    altPhone: (o.phone2 ?? "").trim(), altEmail: (o.email2 ?? "").trim(),
    tags: toAgent ? "buyer-agent" : "developer",
    pinnedNote: [o.market, o.buyBox].filter(Boolean).join(" · ").slice(0, 300),
  } });

  const dupe = await db.crmOpportunity.findFirst({ where: { contactId: contact.id, pipeline, archivedAt: null } }).catch(() => null);
  if (dupe) return { created: false, oppId: dupe.id, name, phone, email };

  const opp = await db.crmOpportunity.create({ data: {
    contactId: contact.id, title: name, pipeline, stage: "new", assignedTo: actor,
    formData: {
      __import: { type: toAgent ? "Buyer Agent" : "Developer", market: o.market ?? "", buyBox: o.buyBox ?? "", source: o.source ?? "Nightly research" },
      ...(o.company ? { dev_buybox: { brokerage: o.company } } : {}),
      // 3rd phone/email live here — the DirectREI export scans formData for phone*/email* fields.
      ...((o.phone3 ?? o.email3) ? { __extra: { phone3: (o.phone3 ?? "").trim(), email3: (o.email3 ?? "").trim() } } : {}),
    } as never,
  } });
  await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `${toAgent ? "Buyer agent" : "Developer"} sourced by nightly research — to research`, actor });
  if (o.notes) await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "note", body: o.notes.slice(0, 2000), actor });
  return { created: true, oppId: opp.id, name, phone, email };
}
