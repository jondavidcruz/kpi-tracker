import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { reiReplyConfigured } from "@/lib/reireply";
import { pullDay, writeDay } from "@/lib/crm-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin-only. Dry-run by default — returns each agent's computed call numbers for a
// day so you can compare to the REI Reply Agent report. Add ?write=1 to write them
// to the scorecard. ?date=YYYY-MM-DD (defaults to today).
export async function GET(request: Request) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return NextResponse.json({ error: "admin only" }, { status: 403 });
  if (!reiReplyConfigured()) return NextResponse.json({ ok: false, hint: "REI Reply key/location not set." });

  const url = new URL(request.url);
  const settings = await getSettings();
  const tz = settings.orgTimezone;
  const date = url.searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const write = url.searchParams.get("write") === "1";

  if (write) {
    const { result, wrote } = await writeDay(date, tz);
    return NextResponse.json({ ok: true, wrote: true, date, scanned: result.scanned, perAgent: wrote });
  }
  const result = await pullDay(date, tz);
  return NextResponse.json({ ok: true, wrote: false, date, scanned: result.scanned, pages: result.pages, perAgent: result.per, note: "Dry run — compare to the Agent report. Add &write=1 to save to the scorecard." });
}
