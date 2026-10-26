import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// 🔧 TEMPORARY debug endpoint (Jon 2026-10-26: novation contact pages 500 with
// "Connection closed"). Secret-protected dump of ONE opp's formData shape + sizes so
// we can find the value that breaks the full-page render. DELETE once the bug is fixed.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("k") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "nope" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id") || "";
  const opp = await db.crmOpportunity.findUnique({ where: { id }, include: { contact: true } });
  if (!opp) return NextResponse.json({ error: "not found" }, { status: 404 });
  const fd = (opp.formData ?? {}) as Record<string, unknown>;
  const keys = fd && typeof fd === "object" ? Object.keys(fd) : [];
  const sizes: Record<string, number> = {};
  for (const k of keys) {
    try { sizes[k] = JSON.stringify(fd[k] ?? null).length; } catch { sizes[k] = -1; /* circular/non-serializable */ }
  }
  let totalLen = -1;
  try { totalLen = JSON.stringify(fd ?? null).length; } catch { totalLen = -2; }
  // event count + biggest event body (huge payload suspect)
  const events = await db.crmEvent.findMany({ where: { contactId: opp.contactId }, select: { kind: true, body: true }, orderBy: { at: "desc" }, take: 400 });
  let maxBody = 0, totalBody = 0;
  for (const e of events) { const l = (e.body || "").length; totalBody += l; if (l > maxBody) maxBody = l; }
  return NextResponse.json({
    pipeline: opp.pipeline, stage: opp.stage, title: opp.title,
    formDataKeys: keys, formDataSizes: sizes, formDataTotalLen: totalLen,
    eventCount: events.length, maxEventBodyLen: maxBody, totalEventBodyLen: totalBody,
    assignmentDraft: fd.__assignmentDraft ?? null,
    dispoOffers: fd.__dispoOffers ?? null,
    dispoBuyers: fd.__dispoBuyers ?? null,
    gates: fd.__gates ?? null,
    marketing: fd.__marketing ?? null,
    followers: fd.__followers ?? null,
    contactAddress: opp.contact?.address ?? "",
  });
}
