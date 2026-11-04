import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 📜 A buyer's recent comms history (calls / texts / emails / notes) for the dispo buyer
// tracker. Fetched LAZILY — only when a user expands that buyer's '📜 History' — so it adds
// no egress on a normal deal-view render (Jon 2026-11-03, mindful of Supabase spend).
const KINDS = ["call", "sms", "email", "note", "voicemail"];

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ events: [] }, { status: allowed ? 200 : 403 });
  const contactId = new URL(req.url).searchParams.get("contactId") ?? "";
  if (!contactId) return NextResponse.json({ events: [] });
  const rows = await db.crmEvent.findMany({
    where: { contactId, kind: { in: KINDS } },
    orderBy: { at: "desc" }, take: 15,
    select: { id: true, kind: true, body: true, actor: true, at: true },
  }).catch(() => []);
  const events = rows.map((e) => {
    const body = e.body.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    const inbound = body.startsWith("⬅");
    return {
      id: e.id,
      kind: e.kind,
      inbound,
      text: body.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").replace(/\s*—\s*https?:\/\/\S+$/, "").replace(/^(?:📞|🎙|📲|☎️|📼|📝|💬|✉️)\s*/u, "").slice(0, 180),
      actor: e.actor && !/^(inbound-sms|recorder|master-workflow|system)$/.test(e.actor) ? e.actor.split(" ")[0] : "",
      at: e.at.toISOString(),
    };
  });
  return NextResponse.json({ events });
}
