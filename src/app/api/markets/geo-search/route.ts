import { NextResponse } from "next/server";
import { getCurrentUser, canAccessMarketing } from "@/lib/auth";
import { searchAreaBoundary } from "@/lib/geocode";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// 🔎 Search a county/ZIP → its boundary polygon (free OSM). The map drops the shape as a
// pending territory to name + save — no physical drawing needed.
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || !canAccessMarketing(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });
  const area = await searchAreaBoundary(q);
  if (!area) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(area, { headers: { "Cache-Control": "private, no-store" } });
}
