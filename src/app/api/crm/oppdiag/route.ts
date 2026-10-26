import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";

// 🔧 TEMPORARY manager-only diagnostic (Jon 2026-10-26): dump ONE opp's formData shape
// + sizes so we can find the value that aborts the full-page render on novation deals.
// Lives under /api/crm so it's already behind the auth middleware. DELETE after the fix.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  // 🔧 Read the captured server errors (from instrumentation.ts) — the real cause behind
  // the client's "Connection closed".
  if (req.nextUrl.searchParams.get("errors") === "1") {
    const row = await db.resource.findFirst({ where: { category: "__server_errors__" } }).catch(() => null);
    let arr: unknown[] = [];
    try { arr = row?.description ? JSON.parse(row.description) : []; } catch { arr = []; }
    return NextResponse.json({ serverErrors: arr });
  }
  if (req.nextUrl.searchParams.get("probe") === "1") {
    const row = await db.resource.findFirst({ where: { category: "__render_probe__" } }).catch(() => null);
    let arr: unknown[] = [];
    try { arr = row?.description ? JSON.parse(row.description) : []; } catch { arr = []; }
    return NextResponse.json({ renderProbe: arr });
  }
  const id = req.nextUrl.searchParams.get("id") || "";
  const q = req.nextUrl.searchParams.get("q") || "";
  const opp = id
    ? await db.crmOpportunity.findUnique({ where: { id }, include: { contact: true } })
    : q
    ? await db.crmOpportunity.findFirst({ where: { archivedAt: null, OR: [{ title: { contains: q, mode: "insensitive" } }, { contact: { name: { contains: q, mode: "insensitive" } } }] }, orderBy: { updatedAt: "desc" }, include: { contact: true } })
    : null;
  if (!opp) return NextResponse.json({ error: "not found — pass ?id= or ?q=name" }, { status: 404 });
  // How many Drive files does this deal render? (the Documents section — a prime weight on listed deals)
  let driveFileCount = -1;
  try { const g = await import("@/lib/gdrive"); driveFileCount = (await g.listDealFiles(opp.contact?.address || opp.title || opp.contact?.name || "")).length; } catch { driveFileCount = -2; }
  // snippet library size — the composers serialize these as props (prime payload suspect)
  let snippetCount = -1, snippetBytes = -1, seqCount = -1, seqBytes = -1;
  try {
    const { readSnippets, readSequences } = await import("@/lib/crm-templates");
    const sn = await readSnippets(); snippetCount = sn.length; snippetBytes = JSON.stringify(sn).length;
    const sq = await readSequences(); seqCount = sq.length; seqBytes = JSON.stringify(sq).length;
  } catch { /* ignore */ }
  const fd = (opp.formData ?? {}) as Record<string, unknown>;
  const keys = fd && typeof fd === "object" ? Object.keys(fd) : [];
  const sizes: Record<string, number> = {};
  for (const k of keys) {
    try { sizes[k] = JSON.stringify(fd[k] ?? null).length; } catch { sizes[k] = -1; }
  }
  let totalLen = -1;
  try { totalLen = JSON.stringify(fd ?? null).length; } catch { totalLen = -2; }
  const events = await db.crmEvent.findMany({ where: { contactId: opp.contactId }, select: { kind: true, body: true, meta: true }, orderBy: { at: "desc" }, take: 400 });
  // 🔎 full event dump (?events=1) — to eyeball the value that breaks serialization
  if (req.nextUrl.searchParams.get("events") === "1") {
    const full = await db.crmEvent.findMany({ where: { contactId: opp.contactId }, orderBy: { at: "desc" }, take: 60 });
    return NextResponse.json({
      oppId: opp.id, pipeline: opp.pipeline, stage: opp.stage,
      opp: { title: opp.title, value: opp.value, askPrice: opp.askPrice, nextFollowUp: opp.nextFollowUp, tags: opp.tags, devPricingSentAt: opp.devPricingSentAt, formData: opp.formData },
      contact: opp.contact,
      events: full.map((e) => ({ id: e.id, kind: e.kind, actor: e.actor, at: e.at, oppId: e.oppId, body: e.body, meta: e.meta })),
    });
  }
  let maxBody = 0, totalBody = 0, totalMeta = 0, maxMeta = 0, recCount = 0;
  const kinds: Record<string, number> = {};
  for (const e of events) {
    const l = (e.body || "").length; totalBody += l; if (l > maxBody) maxBody = l;
    kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    let ml = 0; try { ml = JSON.stringify(e.meta ?? null).length; } catch { ml = -1; }
    totalMeta += Math.max(0, ml); if (ml > maxMeta) maxMeta = ml;
    if ((e.body || "").startsWith("🎙")) recCount++;
  }
  return NextResponse.json({
    pipeline: opp.pipeline, stage: opp.stage, title: opp.title,
    formDataKeys: keys, formDataSizes: sizes, formDataTotalLen: totalLen,
    oppId: opp.id,
    eventCount: events.length, maxEventBodyLen: maxBody, totalEventBodyLen: totalBody,
    totalMetaLen: totalMeta, maxMetaLen: maxMeta, recordingEvents: recCount, eventKinds: kinds,
    driveFileCount, snippetCount, snippetBytes, seqCount, seqBytes,
    assignmentDraft: fd.__assignmentDraft ?? null,
    dispoOffers: fd.__dispoOffers ?? null,
    dispoBuyers: fd.__dispoBuyers ?? null,
    gates: fd.__gates ?? null,
    marketing: fd.__marketing ?? null,
    followers: fd.__followers ?? null,
    contactAddress: opp.contact?.address ?? "",
  });
}
