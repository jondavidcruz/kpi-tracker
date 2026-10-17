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

// ── CREATE a buyer (MarketContact), deduped, with a BuyerHistory "create" row.
// The sanctioned insert path (Jon 2026-10-16 overnight: grow Vetted Buyers from
// free sources — our own data + public research — never DealMachine credits).
type NewBuyer = {
  name: string; company?: string; phone?: string; phone2?: string; email?: string;
  website?: string; links?: string; category?: string; type?: string; companySize?: string;
  region?: string; market?: string; buyBox?: string; priceRange?: string; status?: string;
  vetStage?: string; decisionMaker?: string; notes?: string; source?: string;
};
const last10 = (p?: string) => (p || "").replace(/\D/g, "").slice(-10);
const norm = (s?: string) => (s || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** Find an existing (non-archived) buyer that matches by phone, company, or name+email. */
export async function findBuyerDup(b: { name?: string; company?: string; phone?: string; email?: string }): Promise<string | null> {
  const ph = last10(b.phone);
  const nm = norm(b.company) || norm(b.name);
  const em = (b.email || "").trim().toLowerCase();
  if (!ph && !nm && !em) return null;
  const rows = await db.marketContact.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, company: true, phone: true, phone2: true, email: true },
    take: 5000,
  });
  for (const r of rows) {
    if (ph && (last10(r.phone) === ph || last10(r.phone2) === ph)) return r.id;
    if (em && (r.email || "").trim().toLowerCase() === em && em.length > 3) return r.id;
    if (nm && (norm(r.company) === nm || norm(r.name) === nm) && nm.length > 3) return r.id;
  }
  return null;
}

/** Create a buyer if not already present. Returns {created, id, dup}. */
export async function createBuyer(b: NewBuyer, actor: Actor, opts?: { isLand?: boolean; targetStates?: string[] }): Promise<{ created: boolean; id: string | null; dup: boolean }> {
  if (!b.name?.trim() && !b.company?.trim()) return { created: false, id: null, dup: false };
  const dupId = await findBuyerDup(b);
  if (dupId) return { created: false, id: dupId, dup: true };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const row = await db.marketContact.create({
    data: {
      name: (b.name || b.company || "").slice(0, 160),
      company: b.company ?? "", phone: b.phone ?? "", phone2: b.phone2 ?? "", email: b.email ?? "",
      website: b.website ?? "", links: b.links ?? "",
      category: b.category ?? "land", type: b.type ?? "developer",
      companySize: b.companySize ?? "", region: b.region ?? "", market: b.market ?? "",
      buyBox: b.buyBox ?? "", priceRange: b.priceRange ?? "", decisionMaker: b.decisionMaker ?? "",
      status: b.status ?? "", vetStage: b.vetStage ?? "to_vet", vetStatus: "to_contact",
      notes: b.notes ?? "", addedById: "system", addedOn: today,
      bestContact: b.source ? `Source: ${b.source}` : "",
    },
  });
  await db.buyerHistory.create({
    data: { buyerId: row.id, actor: who(actor), action: "create", after: { name: row.name, company: row.company, source: b.source ?? "" } as Prisma.InputJsonValue },
  });
  // Land flag (so it shows in the land buyer map/match) — Resource __buyer_land__.
  if (opts?.isLand) {
    try {
      const r = await db.resource.findFirst({ where: { category: "__buyer_land__" } });
      const flags: Record<string, unknown> = r?.description ? JSON.parse(r.description) : {};
      flags[row.id] = { isLandBuyer: true, ...(opts.targetStates?.length ? { targetStates: opts.targetStates } : {}) };
      const description = JSON.stringify(flags);
      if (r) await db.resource.update({ where: { id: r.id }, data: { description } });
      else await db.resource.create({ data: { title: "buyer-land", category: "__buyer_land__", url: "", description } });
    } catch { /* flag best-effort */ }
  }
  return { created: true, id: row.id, dup: false };
}
