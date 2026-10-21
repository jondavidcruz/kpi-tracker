import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canAccessMarketing, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE } from "@/lib/dispo-buyers";

// 🔎 Search the Buyer-Network CRM (developers + buyer agents) to ATTACH to a deal
// (Jon 2026-10-20). Returns the top matches for the deal's area / a typed query.
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me) && !isManager(me)) return NextResponse.json({ results: [] }, { status: 403 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const kind = req.nextUrl.searchParams.get("kind") ?? ""; // "developer" | "agent" | ""
  const pipelines = kind === "agent" ? [DISPO_AGENT_PIPELINE] : kind === "developer" ? [DISPO_DEV_PIPELINE] : [DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE];

  const rows = await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: pipelines } },
    orderBy: { updatedAt: "desc" },
    take: 400,
    select: { id: true, title: true, pipeline: true, formData: true, contact: { select: { name: true, phone: true, email: true, pinnedNote: true } } },
  }).catch(() => []);

  const results = rows.map((o) => {
    const imp = ((o.formData ?? {}) as { __import?: { market?: string; buyBox?: string } }).__import ?? {};
    const area = imp.market || "";
    const buyBox = imp.buyBox || o.contact?.pinnedNote || "";
    return { id: o.id, name: o.contact?.name || o.title, phone: o.contact?.phone || "", email: o.contact?.email || "", area, buyBox, kind: o.pipeline === DISPO_AGENT_PIPELINE ? "buyer_agent" : "developer" };
  }).filter((r) => !q || `${r.name} ${r.area} ${r.buyBox} ${r.phone}`.toLowerCase().includes(q));

  return NextResponse.json({ results: results.slice(0, 25) });
}
