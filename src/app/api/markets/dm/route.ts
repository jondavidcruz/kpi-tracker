import { NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { dmPing, dmLocationSearch, dmCount, buildLandFilters, type DmLoc, type DmFilter, type LandFilterInput } from "@/lib/dealmachine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 🏕 DealMachine research endpoint (manager-only). Counts are FREE — no credits spent.
//   GET  ?action=ping                 → verify the v2 key works
//   GET  ?action=locations&q=Lee...   → resolve a county/city/zip to its code
//   POST { locations, filters }       → free property count for an area + land filters
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "ping";
  if (action === "ping") return NextResponse.json(await dmPing());
  if (action === "locations") {
    const q = url.searchParams.get("q") ?? "";
    const type = (url.searchParams.get("type") ?? undefined) as "county" | "city" | "zip_code" | "state" | undefined;
    if (!q.trim()) return NextResponse.json({ data: [] });
    return NextResponse.json({ data: await dmLocationSearch(q, type) });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { locations?: DmLoc[]; filters?: DmFilter[]; land?: LandFilterInput };
  if (!body.locations?.length) return NextResponse.json({ error: "pick an area first" }, { status: 400 });
  const filters = body.land ? buildLandFilters(body.land) : (body.filters ?? []);
  const r = await dmCount(body.locations, filters);
  if (!r.ok) return NextResponse.json({ error: r.error, status: r.status }, { status: 502 });
  return NextResponse.json({ ok: true, count: r.count });
}
