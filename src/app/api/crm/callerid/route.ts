import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ☎️ Caller-ID helper for the dialer (Jon 2026-10-12):
// ?num=+19093956195 → who that is in the CRM (name on the incoming banner)
// ?last=1           → who on the team answered the most recent inbound call
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });

  if (req.nextUrl.searchParams.get("last") === "1") {
    const row = await db.resource.findFirst({ where: { category: "__last_answer__" } });
    let d: { at?: string; agent?: string; from?: string; callerName?: string } = {};
    try { d = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
    return NextResponse.json(d, { headers: { "Cache-Control": "private, no-store" } });
  }

  const num = req.nextUrl.searchParams.get("num") ?? "";
  const last10 = num.replace(/\D/g, "").slice(-10);
  if (last10.length !== 10) return NextResponse.json({ name: "" });
  const c = await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true, name: true, address: true } });
  return NextResponse.json({ name: c?.name ?? "", id: c?.id ?? "", address: c?.address ?? "" }, { headers: { "Cache-Control": "private, no-store" } });
}
