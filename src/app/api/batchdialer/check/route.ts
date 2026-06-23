import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { batchDialerConfigured, bdFetch } from "@/lib/batchdialer";

export const dynamic = "force-dynamic";

// Admin-only flexible probe. The Batch Dialer call endpoint isn't fully documented
// publicly, so try paths with ?path=/calls (default tries a few common ones) until
// we get a 200 with call records, then I wire the talk-time aggregation.
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only" }, { status: 403 });
  if (!batchDialerConfigured()) return NextResponse.json({ ok: false, hint: "Add BATCHDIALER_API_KEY in Vercel and redeploy." });

  const url = new URL(request.url);
  const custom = url.searchParams.get("path");
  const paths = custom ? [custom] : ["/calls", "/call-logs", "/reports/calls", "/dialer/calls", "/v1/calls", "/account", "/agents", "/users"];
  const tried: unknown[] = [];
  for (const p of paths) {
    const r = await bdFetch(p);
    tried.push({ path: p, status: r.status, ok: r.ok, sample: r.ok ? JSON.stringify(r.body).slice(0, 400) : JSON.stringify(r.body).slice(0, 150) });
    if (r.ok) break; // found a working endpoint
  }
  return NextResponse.json({ base: process.env.BATCHDIALER_BASE || "https://api.batchservice.com (default)", tried });
}
