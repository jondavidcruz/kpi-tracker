import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { stateFromPunches } from "@/lib/presence";
import { sendTimecardChat } from "@/lib/notify";

export const dynamic = "force-dynamic";

const GAP_MS = 4 * 60 * 1000; // a gap longer than this while clocked in = likely outage
function nowLocalMin(tz: string): number {
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/** The app pings this ~every minute. We record last-seen and, if there was a gap
 *  while the person was clocked in, return a "drop" so they can confirm an outage. */
export async function POST() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ ok: false }, { status: 401 });

  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const now = new Date();
  const prev = me.lastSeenAt ? new Date(me.lastSeenAt) : null;

  // A real away-gap (they were gone, now back) — only then do we treat it as a drop/return.
  const reconnected = !!prev && now.getTime() - prev.getTime() >= GAP_MS;

  // Were they clocked in (working / break / lunch)?
  const punches = await db.punch.findMany({ where: { userId: me.id, date }, orderBy: { at: "asc" }, select: { kind: true, at: true } });
  const working = stateFromPunches(punches).state !== "offline";

  let drop: { sinceMs: number; gapMin: number } | null = null;
  if (reconnected && working) {
    // Don't re-prompt if an outage already covers this window.
    const covered = await db.outage.findFirst({ where: { userId: me.id, date, OR: [{ ongoing: true }, { createdAt: { gte: prev! } }] } });
    if (!covered) drop = { sinceMs: prev!.getTime(), gapMin: Math.round((now.getTime() - prev!.getTime()) / 60000) };
  }

  // A real reconnect clears any live (manager-flagged) outage + tells Chat.
  if (reconnected) {
    const ongoing = await db.outage.findMany({ where: { userId: me.id, date, ongoing: true } });
    if (ongoing.length) {
      await db.outage.updateMany({ where: { userId: me.id, date, ongoing: true }, data: { ongoing: false, endMin: nowLocalMin(settings.orgTimezone) } });
      const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.orgTimezone });
      const kind = ongoing[0].kind;
      sendTimecardChat(`🟢 ${me.name} is BACK online — ${kind === "power" ? "⚡ power" : "📶 internet"} outage cleared · ${time}`).catch(() => {});
    }
  }

  await db.user.update({ where: { id: me.id }, data: { lastSeenAt: now } });
  return NextResponse.json({ ok: true, drop });
}
