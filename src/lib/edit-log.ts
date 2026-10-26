import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

// A rep filling out a section (Home / Land details, a discovery form, parcels) used to drop a
// FRESH "… updated" row on the timeline for every save — Nicholas filling Home Details showed
// up 15+ times (Jon 2026-10-26: "it shouldn't log every single change — just bulk it, show how
// many fields out of how many are complete"). Now there is exactly ONE rolling summary row per
// section per deal: found by a stable `editKey` in meta (regardless of who/when), updated in
// place, and bumped to the top. The first time we write a keyed summary we also sweep up the
// old pre-coalescing duplicates for that deal so the timeline is clean.
export async function logEditCoalesced(opts: { contactId: string; oppId: string; body: string; actor: string; editKey?: string }): Promise<void> {
  const { contactId, oppId, body, actor } = opts;
  if (!oppId) { if (contactId) await logCrmEvent({ contactId, oppId, kind: "system", body, actor }); return; }
  // section label = everything before the first " (", " —" or " ·" (e.g. "🏡 Home Details")
  const label = body.split(/\s[—(·]/)[0].trim();
  const editKey = opts.editKey ?? label;
  const existing = await db.crmEvent.findFirst({
    where: { oppId, kind: "system", meta: { path: ["editKey"], equals: editKey } },
    orderBy: { at: "desc" }, select: { id: true },
  }).catch(() => null);
  if (existing) {
    await db.crmEvent.update({ where: { id: existing.id }, data: { at: new Date(), body, actor, meta: { editKey } as never } }).catch(() => {});
    return;
  }
  // first keyed summary for this section → clear out the old un-keyed "… updated" spam on THIS
  // deal so the timeline condenses to the single summary row we're about to write.
  await db.crmEvent.deleteMany({ where: { oppId, kind: "system", body: { startsWith: label } } }).catch(() => {});
  if (contactId) await logCrmEvent({ contactId, oppId, kind: "system", body, meta: { editKey } as never, actor });
}
