import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { pandadocConfigured, probeDocs } from "@/lib/pandadoc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin-only: verify the PandaDoc key + show recent completed-document shapes so we
// can map template → contract type (assignment/novation/creative) and creator → rep.
export async function GET() {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only" }, { status: 403 });
  if (!pandadocConfigured()) return NextResponse.json({ ok: false, hint: "Add PANDADOC_API_KEY in Vercel → Settings → Environment Variables, then redeploy." });
  const shape = await probeDocs();
  return NextResponse.json({ ok: true, shape });
}
