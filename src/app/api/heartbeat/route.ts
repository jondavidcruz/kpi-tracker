import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { stateFromPunches } from "@/lib/presence";

export const dynamic = "force-dynamic";

const GAP_MS = 4 * 60 * 1000; // a gap longer than this while clocked in = likely outage

/** The app pings this ~every minute. We record last-seen and, if there was a gap
 *  while the person was clocked in, return a "drop" so they can confirm an outage. */
export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });

  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const now = new Date();
  const prev = me.lastSeenAt ? new Date(me.lastSeenAt) : null;

  // Were they clocked in (working / break / lunch)?
  const punches = await db.punch.findMany({ where: { userId: me.id, date }, orderBy: { at: "asc" }, select: { kind: true, at: true } });
  const working = stateFromPunches(punches).state !== "offline";

  let drop: { sinceMs: number; gapMin: number } | null = null;
  if (prev && working) {
    const gap = now.getTime() - prev.getTime();
    if (gap >= GAP_MS) {
      // Don't re-prompt if an outage already covers this window.
      const covered = await db.outage.findFirst({ where: { userId: me.id, date, OR: [{ ongoing: true }, { createdAt: { gte: prev } }] } });
      if (!covered) drop = { sinceMs: prev.getTime(), gapMin: Math.round(gap / 60000) };
    }
  }

  await db.user.update({ where: { id: me.id }, data: { lastSeenAt: now } });
  return NextResponse.json({ ok: true, drop });
}
