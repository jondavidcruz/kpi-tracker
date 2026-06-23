import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { reiReplyConfigured } from "@/lib/reireply";
import { pullDay, writeDay, pullOpps, writeOpps } from "@/lib/crm-sync";

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
    const opps = await writeOpps(date, tz);
    return NextResponse.json({ ok: true, wrote: true, date, scanned: result.scanned, calls: wrote, offersContracts: opps.counts });
  }
  const result = await pullDay(date, tz);
  const opps = await pullOpps(date, tz);
  return NextResponse.json({
    ok: true, wrote: false, date,
    calls: { scanned: result.scanned, pages: result.pages, perAgent: result.per },
    offersContracts: { scanned: opps.scanned, counts: opps.counts, sample: opps.sample, debug: opps.debug },
    note: "Dry run — compare to the Agent report. Add &write=1 to save to the scorecard.",
  });
}
