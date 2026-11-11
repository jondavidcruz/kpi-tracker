import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { readPullLists, addPullBatch, removePullBatch } from "@/lib/pull-lists";

export const dynamic = "force-dynamic";

// 📄 Pulled-list batches — persist an uploaded pull so the map can re-plot it, and list/remove them.
// Manager-only. NO CRM import happens here — this only records where the pulled properties are.
export async function GET() {
  const me = await getCurrentUser();
  if (!isManager(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  return NextResponse.json({ batches: await readPullLists() });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isManager(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  let body: { name?: string; count?: number; zips?: string[]; pts?: [number, number][] } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const pts = Array.isArray(body.pts) ? body.pts : [];
  if (!pts.length) return NextResponse.json({ error: "no mappable rows (need latitude/longitude)" }, { status: 400 });
  const batch = await addPullBatch({
    name: body.name || "Pulled list",
    by: me!.name.split(" ")[0],
    count: body.count ?? pts.length,
    zips: Array.isArray(body.zips) ? body.zips : [],
    pts,
  });
  return NextResponse.json({ ok: true, batch });
}

export async function DELETE(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isManager(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (id) await removePullBatch(id);
  return NextResponse.json({ ok: true });
}
