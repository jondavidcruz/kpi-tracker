// 🔁 Duplicate-contact finder (crm-enhancer 2026-10-16). READ-ONLY: groups
// live contacts that share a phone number (last 10 digits; alt phones count).
// Same seller split across two reps' pipelines (the GHL import did this a lot)
// is the #1 cause of two people calling one seller. Nothing here merges or
// deletes — the page just shows the groups so a human can keep one card and
// 🗑 archive the other (archive-only, never deleted).
import { db } from "./db";

export type DupeMember = { id: string; name: string; phone: string; owner: string; updatedAt: Date; opp: { id: string; pipeline: string; stage: string } | null };
export type DupeGroup = { phone: string; members: DupeMember[] };

const last10 = (p: string) => (p || "").replace(/\D/g, "").slice(-10);

export async function findDuplicateContacts(opts: { owner?: string; limit?: number } = {}): Promise<{ groups: DupeGroup[]; scanned: number }> {
  const contacts = await db.crmContact.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, phone: true, altPhone: true, assignedTo: true, updatedAt: true },
    take: 60000,
  });
  const byPhone = new Map<string, typeof contacts>();
  for (const c of contacts) for (const p of [c.phone, c.altPhone]) {
    const k = last10(p); if (k.length < 10) continue;
    const arr = byPhone.get(k) ?? []; if (!arr.some((x) => x.id === c.id)) arr.push(c); byPhone.set(k, arr);
  }
  let groups = [...byPhone.entries()].filter(([, a]) => a.length > 1);
  if (opts.owner) {
    const o = opts.owner.toLowerCase();
    groups = groups.filter(([, a]) => a.some((c) => (c.assignedTo || "").toLowerCase() === o));
  }
  // newest activity first so the groups the team is actively touching surface
  groups.sort((a, b) => Math.max(...b[1].map((c) => c.updatedAt.getTime())) - Math.max(...a[1].map((c) => c.updatedAt.getTime())));
  groups = groups.slice(0, opts.limit ?? 200);
  const ids = groups.flatMap(([, a]) => a.map((c) => c.id));
  const opps = ids.length
    ? await db.crmOpportunity.findMany({ where: { contactId: { in: ids }, archivedAt: null }, select: { id: true, contactId: true, pipeline: true, stage: true, updatedAt: true }, orderBy: { updatedAt: "desc" } })
    : [];
  const oppBy = new Map<string, { id: string; pipeline: string; stage: string }>();
  for (const o of opps) if (!oppBy.has(o.contactId)) oppBy.set(o.contactId, { id: o.id, pipeline: o.pipeline || "War Room", stage: o.stage });
  return {
    scanned: contacts.length,
    groups: groups.map(([phone, a]) => ({
      phone,
      members: a.map((c) => ({ id: c.id, name: c.name, phone: c.phone, owner: c.assignedTo, updatedAt: c.updatedAt, opp: oppBy.get(c.id) ?? null })),
    })),
  };
}
