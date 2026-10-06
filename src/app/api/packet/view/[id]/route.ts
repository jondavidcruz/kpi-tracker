import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderPacketHtml } from "@/lib/packet/template";
import type { PacketModel } from "@/lib/packet/types";

export const dynamic = "force-dynamic";

// Render a packet as an actual web page. Drive's viewer shows .html files as
// source code (Jon 2026-10-06: "it just shows HTML code"), so the team views
// packets here — re-rendered from the stored model, always in sync. Print to
// PDF straight from this page.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(new URL("/login", _req.url));
  const { id } = await params;
  const pk = await db.dealPacket.findUnique({ where: { id }, select: { model: true } });
  if (!pk) return new NextResponse("Packet not found", { status: 404 });
  const html = renderPacketHtml(pk.model as unknown as PacketModel);
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
