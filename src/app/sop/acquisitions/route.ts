import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import HTML from "@/lib/sop/acq-html";

export const dynamic = "force-dynamic";

// Acquisitions SOP — any signed-in team member (acquisitions reps included). Served
// through a route so the raw file isn't a public URL (Jon 2026-10-22).
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(new URL("/login?next=/sop/acquisitions", req.url));
  return new NextResponse(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
}
