import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { reiReplyConfigured, probeCallShape } from "@/lib/reireply";

export const dynamic = "force-dynamic";

// Admin-only: reads a few recent call records and reports their structure (no PII)
// so we can wire the daily aggregation to the real field names.
export async function GET() {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only — sign in as Jon" }, { status: 403 });
  if (!reiReplyConfigured()) return NextResponse.json({ ok: false, hint: "REI Reply key/location not set in Vercel." });
  const shape = await probeCallShape();
  return NextResponse.json({ ok: true, shape });
}
