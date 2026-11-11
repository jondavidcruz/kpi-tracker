import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { geocodeBatch } from "@/lib/geocode";
import { leadZips } from "@/lib/lead-pins";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // rate-limited batch (~1s/place) — under the Hobby 60s cap

// 🔄 Geocode a batch of the ZIPs our seller leads come from, into the shared cache (free OSM
// Nominatim, cached forever so it's a one-time cost). Manager-triggered from the map; run again for
// the remainder. Never called on page render.
export async function POST() {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const opps = await db.crmOpportunity
    .findMany({ where: { archivedAt: null }, select: { contact: { select: { address: true } } }, take: 6000 })
    .catch(() => []);
  // ⭐ Also resolve CLOSED-deal property addresses (exact street address) so they pin at the real lot.
  const closed = await db.deal.findMany({ where: { status: "closed" }, select: { address: true } }).catch(() => []);
  const closedAddrs = closed.map((d) => d.address).filter((a): a is string => !!a && a.trim().length > 4);
  const res = await geocodeBatch([...closedAddrs, ...leadZips(opps)], 25);
  return NextResponse.json({ ok: true, ...res });
}
