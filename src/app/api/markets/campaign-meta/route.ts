import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { readCampaignLinks, setCampaignLink, readCampaignNotes, addCampaignNote, deleteCampaignNote } from "@/lib/pull-campaign-meta";

export const dynamic = "force-dynamic";

// 🔗 Pull-campaign metadata — explicit Direct REI campaign link + manual notes/offers log, per batch.
// Manager-only (the campaigns live on the leadership-gated /markets map).
export async function GET() {
  const me = await getCurrentUser();
  if (!isManager(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  return NextResponse.json({ links: await readCampaignLinks(), notes: await readCampaignNotes() });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  if (!isManager(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  let body: { action?: string; batchId?: string; campaign?: string; text?: string; at?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const batchId = (body.batchId || "").trim();
  if (!batchId) return NextResponse.json({ error: "missing batchId" }, { status: 400 });
  switch (body.action) {
    case "link":
      await setCampaignLink(batchId, body.campaign ?? "");
      return NextResponse.json({ ok: true, links: await readCampaignLinks() });
    case "note": {
      if (!(body.text || "").trim()) return NextResponse.json({ error: "empty note" }, { status: 400 });
      const list = await addCampaignNote(batchId, body.text!, me!.name.split(" ")[0]);
      return NextResponse.json({ ok: true, notes: list });
    }
    case "delnote":
      if (body.at) await deleteCampaignNote(batchId, body.at);
      return NextResponse.json({ ok: true, notes: (await readCampaignNotes())[batchId] ?? [] });
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
