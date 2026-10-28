// 🧹 Recording de-dupe (Jon 2026-10-27: recordings logged 2–3× were eating storage).
// New dupes are already prevented (the call webhook checks meta.ccId before logging);
// this cleans the BACKLOG. A bare GET is a DRY RUN (counts only, deletes nothing).
// ?go=1 deletes the extras, keeping the EARLIEST recording per call (meta.ccId).
// ⚠️ CrmEvent has no archivedAt, so a delete is permanent — hence dry-run by default.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) { return GET(request); }

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const bySecret = !!secret && (auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret);
  const me = await getCurrentUser().catch(() => null);
  if (!bySecret && !isOwner(me)) return NextResponse.json({ error: "owner only" }, { status: 403 });

  // Every recording row (filed recordings start with 🎙). Oldest first so we keep the first.
  const recs = await db.crmEvent.findMany({
    where: { kind: "call", body: { startsWith: "🎙" } },
    orderBy: { at: "asc" },
    select: { id: true, at: true, meta: true, oppId: true },
  });

  // Group by the call-control id (the true identity of one recording). Rows with no
  // ccId can't be safely de-duped, so they're left alone.
  const byCc = new Map<string, { id: string; at: Date }[]>();
  let noCcId = 0;
  for (const r of recs) {
    const ccId = (r.meta as { ccId?: string } | null)?.ccId;
    if (!ccId) { noCcId++; continue; }
    const arr = byCc.get(ccId) ?? [];
    arr.push({ id: r.id, at: r.at });
    byCc.set(ccId, arr);
  }

  // Extras = everything after the earliest in each group.
  const extras: string[] = [];
  let dupeGroups = 0;
  for (const [, arr] of byCc) {
    if (arr.length > 1) {
      dupeGroups++;
      arr.sort((a, b) => a.at.getTime() - b.at.getTime());
      for (const e of arr.slice(1)) extras.push(e.id);
    }
  }

  const summary = {
    totalRecordingRows: recs.length,
    uniqueCalls: byCc.size,
    rowsWithoutCcId: noCcId,
    duplicateCalls: dupeGroups,
    deletableExtras: extras.length,
  };

  if (url.searchParams.get("go") === "1") {
    let deleted = 0;
    for (let i = 0; i < extras.length; i += 200) {
      const batch = extras.slice(i, i + 200);
      const res = await db.crmEvent.deleteMany({ where: { id: { in: batch } } }).catch(() => ({ count: 0 }));
      deleted += res.count;
    }
    return NextResponse.json({ mode: "cleanup", ...summary, deleted });
  }

  return NextResponse.json({
    mode: "dry-run",
    note: "Nothing deleted. Append ?go=1 to remove the duplicate recording rows (keeps the earliest of each call). Permanent — CrmEvent has no archive.",
    ...summary,
    sampleExtraIds: extras.slice(0, 10),
  });
}
