import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { generatePacket } from "@/lib/packet/build";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby ceiling — the pipeline is cache-backed, reruns are fast

// POST {dealId, apns: string[] | "csv", state, county, manual?} — CRON_SECRET
// (header or ?secret=) or a signed-in manager. Lets GHL / Direct REI webhooks
// kick off a draft packet the moment a deal goes under contract (Phase 9).
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const okSecret = !!secret && (auth === `Bearer ${secret}` || new URL(req.url).searchParams.get("secret") === secret);
  if (!okSecret) {
    const me = await getCurrentUser();
    if (!isManager(me)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { dealId?: string; apns?: string[] | string; state?: string; county?: string; manual?: Record<string, string> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const apns = Array.isArray(body.apns) ? body.apns : String(body.apns ?? "").split(/[\s,;]+/).filter(Boolean);
  if (!body.dealId || !apns.length || !body.state || !body.county) {
    return NextResponse.json({ error: "dealId, apns, state, county required" }, { status: 400 });
  }
  const res = await generatePacket({
    dealId: body.dealId, apns, state: String(body.state).toUpperCase().slice(0, 2), county: String(body.county),
    manual: body.manual as never, generatedBy: "webhook",
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 422 });
}
