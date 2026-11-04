import { NextRequest, NextResponse } from "next/server";
import { trackView } from "@/lib/usage";

export const dynamic = "force-dynamic";

// 📊 Page-view beacon sink (Jon 2026-11-04). The client sends the bare path via
// navigator.sendBeacon (text/plain). Deliberately cheap: one small upsert, no user lookup,
// and it never fails the request — analytics must never affect the app.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.text()).slice(0, 300);
    let path = body;
    try { const j = JSON.parse(body); if (j && typeof j.path === "string") path = j.path; } catch { /* plain string */ }
    if (path) await trackView(path);
  } catch { /* swallow — a beacon must never 500 */ }
  return new NextResponse(null, { status: 204 });
}
