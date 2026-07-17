import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { buildBuyerBoxReport, sendBuyerBoxReport } from "@/lib/buyer-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin-only. Preview the weekly vetted-buyer lead-sourcing report in the browser, or
// `?send=1` to email it to Jon right now (same content the Friday cron sends).
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only" }, { status: 403 });
  const url = new URL(request.url);
  const settings = await getSettings();
  const today = url.searchParams.get("date") || todayStr(settings.orgTimezone);

  if (url.searchParams.get("send") === "1") {
    const res = await sendBuyerBoxReport(today);
    return NextResponse.json({ ok: true, ...res, note: res.sent ? "Emailed to jon@freedom-offers.com" : "Not sent — 0 vetted buyers or email not configured." });
  }
  const { html } = await buildBuyerBoxReport(today);
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
