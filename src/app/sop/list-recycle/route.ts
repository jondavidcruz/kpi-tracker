import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import HTML from "@/lib/sop/list-recycle-html";

export const dynamic = "force-dynamic";

// Marketing SOP — Pull/Dial/Recycle lists. Any signed-in team member; served through a route so
// the raw file isn't a public URL (matches the acquisitions/dispo SOPs). Jon 2026-10-26.
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(new URL("/login?next=/sop/list-recycle", req.url));
  return new NextResponse(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
}
