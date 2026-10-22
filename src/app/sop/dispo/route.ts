import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, canAccessMarketing, isManager } from "@/lib/auth";
import HTML from "@/lib/sop/dispo-html";

export const dynamic = "force-dynamic";

// 🔒 Dispo SOP — dispositions + managers ONLY (Jon 2026-10-22: new acquisitions reps
// like Nick & Kyle must not see anything dispo). Served through this gated route so a
// direct URL can't reach it; the raw file is no longer in /public.
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(new URL("/login?next=/sop/dispo", req.url));
  if (!canAccessMarketing(me) && !isManager(me)) return NextResponse.redirect(new URL("/dashboard", req.url));
  return new NextResponse(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
}
