import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { reiReplyConfigured, getPipelines } from "@/lib/reireply";

export const dynamic = "force-dynamic";

// Admin-only: lists your pipelines + stages (id + name) so we can map stage moves
// → Offers Made / Contracts Sent KPIs.
export async function GET() {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only" }, { status: 403 });
  if (!reiReplyConfigured()) return NextResponse.json({ ok: false, hint: "REI Reply key/location not set." });
  const r = await getPipelines();
  if (!r.ok) return NextResponse.json({ ok: false, status: r.status, error: r.body });
  const b = r.body as { pipelines?: Array<{ id: string; name: string; stages?: Array<{ id: string; name: string }> }> };
  const pipelines = (b.pipelines ?? []).map((p) => ({ id: p.id, name: p.name, stages: (p.stages ?? []).map((s) => ({ id: s.id, name: s.name })) }));
  return NextResponse.json({ ok: true, pipelines });
}
