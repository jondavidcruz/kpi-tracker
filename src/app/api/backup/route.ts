import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { buildBackup } from "@/lib/backup";
import { todayStr } from "@/lib/date";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

/** On-demand full backup download (owner), or ?buyers=1 to run the buyer
 *  backup-to-Drive (owner session OR CRON_SECRET — the spec's Phase-1 gate). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const me = await getCurrentUser();
  const secret = process.env.CRON_SECRET;
  const secretOk = Boolean(secret) && (url.searchParams.get("secret") === secret || request.headers.get("authorization") === `Bearer ${secret}`);

  if (url.searchParams.get("buyers") === "1") {
    if (!isAdmin(me) && !secretOk) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { runBuyerBackup } = await import("@/lib/buyers/backup");
    const result = await runBuyerBackup();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  if (!isAdmin(me)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const settings = await getSettings();
  const backup = await buildBackup();
  const filename = `war-room-backup-${todayStr(settings.orgTimezone)}.json`;
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
