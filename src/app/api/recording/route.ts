import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendTeamChat } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * File a meeting recording link (Fathom) — stores it + posts to Google Chat.
 * Wire Fathom → Zapier → this endpoint to auto-file + announce after a meeting.
 * Auth: ?secret=$INGEST_SECRET or Authorization: Bearer $INGEST_SECRET.
 * Params (query or JSON body): meeting=monday|leadership, title, url, date=YYYY-MM-DD.
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.INGEST_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const ok = auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
    if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* query-only is fine */ }
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = body[k] ?? url.searchParams.get(k);
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  };

  const meeting = get("meeting").toLowerCase() === "leadership" ? "leadership" : "monday";
  const title = get("title") || "Meeting recording";
  const link = get("url", "link", "share_url", "recording_url");
  const meetingDate = get("date", "meetingDate");
  if (!link) return NextResponse.json({ error: "missing recording url" }, { status: 400 });

  const posted = await sendTeamChat(
    `🎥 *${meeting === "leadership" ? "Leadership" : "Team"} meeting recording* — ${title}\n${link}`,
  );
  await db.meetingRecording.create({ data: { meeting, title, url: link, meetingDate, postedToChat: posted } });
  return NextResponse.json({ ok: true, posted });
}

export const POST = handle;
export const GET = handle;
