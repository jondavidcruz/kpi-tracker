import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { geocodeBatch, placesFromBuyBoxes } from "@/lib/geocode";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // rate-limited batch (~1s/place) — stays under the Hobby 60s cap

// 🔄 Geocode a batch of vetted-buyer buy-box places into the shared cache (free OSM Nominatim,
// cached forever so it's a one-time cost). Manager-triggered from the map; run again for the
// remainder. Never called on page render.
export async function POST() {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const buyers = await db.marketContact
    .findMany({ where: { archivedAt: null, blacklistedAt: null, vetStage: { in: ["vetted", "active"] } }, select: { buyBoxAreas: true, market: true } })
    .catch(() => []);
  const places = placesFromBuyBoxes(buyers);
  const res = await geocodeBatch(places, 25);
  return NextResponse.json({ ok: true, ...res });
}
