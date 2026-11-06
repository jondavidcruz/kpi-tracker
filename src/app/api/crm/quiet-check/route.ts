import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { quietHoursWarning } from "@/lib/npa-tz";

export const dynamic = "force-dynamic";

// 🕘 Server-authoritative quiet-hours check for the dialer. Judges by the phone area code AND
// the OWNER'S MAILING address (Jon 2026-11-05: a land lead's property is in FL but the owner
// may live in CA — quiet hours follow where the PERSON lives, by their mailing address + area
// code, never the property). Uses real server time, so a wrong device clock can't bypass it.
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ quiet: null });
  const url = new URL(req.url);
  const phone = (url.searchParams.get("phone") ?? "").replace(/[^+\d]/g, "");
  const contactId = url.searchParams.get("contactId") ?? "";
  if (!phone) return NextResponse.json({ quiet: null });
  // mailing/home address = where the lead lives (CrmContact.address is "mailing / home")
  const mailing = contactId
    ? (await db.crmContact.findUnique({ where: { id: contactId }, select: { address: true } }).catch(() => null))?.address ?? ""
    : "";
  return NextResponse.json(
    { quiet: quietHoursWarning(phone, mailing) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
