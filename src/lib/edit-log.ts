import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

// A rep fiddling with the same section of a deal (land details, parcels, a discovery form)
// used to drop a fresh "… updated" row on the timeline for every save — so Michelle editing
// the land fields a few times showed up many times (Jon 2026-10-26). Instead we roll repeat
// edits of the SAME section by the SAME person, inside this window, into one entry that bumps
// to the top and shows "· edited N×".
const WINDOW_MS = 60 * 60 * 1000;

export async function logEditCoalesced(opts: { contactId: string; oppId: string; body: string; actor: string }): Promise<void> {
  const { contactId, oppId, body, actor } = opts;
  if (!oppId) { if (contactId) await logCrmEvent({ contactId, oppId, kind: "system", body, actor }); return; }
  // the section label = everything before the first " (" or " —" (e.g. "🏞 Land details updated")
  const label = body.split(/\s[—(]/)[0].trim();
  const since = new Date(Date.now() - WINDOW_MS);
  const recent = await db.crmEvent.findFirst({
    where: { oppId, kind: "system", actor, at: { gte: since }, body: { startsWith: label } },
    orderBy: { at: "desc" }, select: { id: true, meta: true },
  }).catch(() => null);
  if (recent) {
    const meta = (recent.meta as Record<string, unknown> | null) ?? {};
    const n = (typeof meta.edits === "number" ? meta.edits : 1) + 1;
    await db.crmEvent.update({ where: { id: recent.id }, data: { at: new Date(), body: `${body} · edited ${n}×`, meta: { ...meta, edits: n } as never } }).catch(() => {});
    return;
  }
  if (contactId) await logCrmEvent({ contactId, oppId, kind: "system", body, actor });
}
