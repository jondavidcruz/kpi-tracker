import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { commsFor } from "@/lib/crm-comms";

export const dynamic = "force-dynamic";

// 📡 The signed-in user's comms capabilities for the composer — NOT gated on `call` (unlike
// /api/crm/phone), so an iPhone-text-only rep still gets their caps to show the 📱 button while the
// system Send-SMS button stays hidden (Jon 2026-11-10).
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no access" }, { status: 403 });
  const c = await commsFor(me);
  return NextResponse.json(
    { canSms: !!c.sms, canIphone: !!c.iphone, canEmail: !!c.email, canCall: !!c.call },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
