import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { buildBackup } from "@/lib/backup";
import { todayStr } from "@/lib/date";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

/** On-demand full backup download. Owner only. */
export async function GET() {
  const me = await getCurrentUser();
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
