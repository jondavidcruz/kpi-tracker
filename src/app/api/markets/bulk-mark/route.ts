import { NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { searchAreaBoundary } from "@/lib/geocode";
import { saveTerritory, type TerrStatus } from "@/lib/map-territories";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // geocodes 1/sec per Nominatim policy

// 📋 Bulk-mark a list of ZIPs (or counties) as a territory status in one go (managers). Each
// place's boundary is geocoded (free OSM, ~1s each) and saved. Capped to stay under the limit.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { places?: string[]; status?: string };
  const status = body.status as TerrStatus;
  if (!["pulled", "marketing", "target", "avoid"].includes(status)) return NextResponse.json({ error: "bad status" }, { status: 400 });
  const places = [...new Set((body.places ?? []).map((p) => String(p).trim()).filter(Boolean))].slice(0, 40);
  if (!places.length) return NextResponse.json({ error: "no places" }, { status: 400 });
  let marked = 0; const failed: string[] = [];
  for (let i = 0; i < places.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));
    const area = await searchAreaBoundary(places[i]);
    if (area && await saveTerritory({ name: area.name, status, points: area.ring, by: me.name })) marked++;
    else failed.push(places[i]);
  }
  return NextResponse.json({ ok: true, marked, failed, total: places.length });
}
