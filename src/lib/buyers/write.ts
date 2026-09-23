// The ONLY sanctioned write path for buyer (MarketContact) data — Phase 1 of the
// vetted-buyers rebuild (BUILD_SPEC rule 1-2): nothing is deleted, and every
// change lands in BuyerHistory (before/after JSON) inside the same transaction.
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type Actor = string | null | undefined;
const who = (a: Actor) => (a && a.trim()) || "system";

/** Patch whitelisted scalar fields; history row records before/after per call. */
export async function updateBuyer(
  id: string,
  patch: Record<string, unknown>,
  actor: Actor,
  opts?: { action?: string; field?: string },
) {
  const keys = Object.keys(patch);
  if (!id || keys.length === 0) return;
  await db.$transaction(async (tx) => {
    const beforeRow = await tx.marketContact.findUnique({ where: { id } });
    if (!beforeRow) return;
    const before: Record<string, unknown> = {};
    for (const k of keys) before[k] = (beforeRow as Record<string, unknown>)[k];
    await tx.marketContact.update({ where: { id }, data: patch as Prisma.MarketContactUpdateInput });
    await tx.buyerHistory.create({
      data: {
        buyerId: id, actor: who(actor), action: opts?.action ?? "update",
        field: opts?.field ?? (keys.length === 1 ? keys[0] : null),
        before: before as Prisma.InputJsonValue, after: patch as Prisma.InputJsonValue,
      },
    });
  });
}

/** Archive (rule zero: never delete). Restorable any time. */
export async function archiveBuyer(id: string, reason: string, actor: Actor) {
  await updateBuyer(
    id,
    { archivedAt: new Date(), archivedBy: who(actor), archiveReason: reason || "" },
    actor,
    { action: "archive" },
  );
}

export async function restoreBuyer(id: string, actor: Actor) {
  await updateBuyer(
    id,
    { archivedAt: null, archivedBy: null, archiveReason: null },
    actor,
    { action: "restore" },
  );
}

/** Set the structured buy box. Never silently: history row action buybox_update. */
export async function setBuyBox(id: string, buyBox: unknown, source: string, actor: Actor) {
  await updateBuyer(
    id,
    { buyBoxStruct: buyBox as Prisma.InputJsonValue, buyBoxUpdatedAt: new Date(), buyBoxSource: source },
    actor,
    { action: "buybox_update" },
  );
}

/** Set the drawn buy-box polygon (GeoJSON Feature|FeatureCollection). */
export async function setPolygon(id: string, geojson: unknown, actor: Actor, centroid?: { lat: number; lng: number }) {
  await updateBuyer(
    id,
    {
      geoPolygon: geojson as Prisma.InputJsonValue,
      ...(centroid ? { geoCentroidLat: centroid.lat, geoCentroidLng: centroid.lng } : {}),
    },
    actor,
    { action: "polygon_update" },
  );
}

/** Structured touch (call/email/text…) + history breadcrumb. */
export async function logTouch(
  id: string,
  t: { channel?: string; outcome?: string; note?: string },
  actor: Actor,
) {
  await db.$transaction(async (tx) => {
    const row = await tx.buyerTouch.create({
      data: { buyerId: id, channel: t.channel ?? null, outcome: t.outcome ?? null, note: t.note ?? null, actor: who(actor) },
    });
    await tx.buyerHistory.create({
      data: { buyerId: id, actor: who(actor), action: "touch", after: { channel: row.channel, outcome: row.outcome, note: row.note } as Prisma.InputJsonValue },
    });
  });
}
