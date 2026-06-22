import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { stateFromPunches, workedMinutes, groupByUser } from "@/lib/presence";
import { workCapAt } from "@/lib/shift";

export const dynamic = "force-dynamic";

/** Live availability board data — polled by the Schedule page's PresenceBoard. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const [users, punches, outages] = await Promise.all([
    db.user.findMany({ where: { active: true, irregularSchedule: false }, orderBy: { name: "asc" }, select: { id: true, name: true, lastSeenAt: true } }),
    db.punch.findMany({ where: { date }, orderBy: { at: "asc" }, select: { userId: true, kind: true, at: true } }),
    db.outage.findMany({ where: { date, ongoing: true }, select: { userId: true, kind: true } }),
  ]);
  const byUser = groupByUser(punches);
  const outByUser = new Map(outages.map((o) => [o.userId, o.kind]));
  const now = new Date();
  const STALE = 5 * 60 * 1000; // working but no heartbeat for 5 min = likely dropped
  const cap = workCapAt(date, settings.orgTimezone);
  const people = users
    .filter((u) => !isOwner(u))
    .map((u) => {
      const ps = byUser.get(u.id) ?? [];
      const { state, since } = stateFromPunches(ps);
      const working = state === "online" || state === "break" || state === "lunch";
      const outageKind = outByUser.get(u.id);
      let st: string = state;
      if (outageKind) st = "outage";
      else if (working && u.lastSeenAt && now.getTime() - new Date(u.lastSeenAt).getTime() > STALE) st = "dropped";
      return { id: u.id, name: u.name, state: st, outageKind: outageKind ?? null, sinceMs: since ? since.getTime() : null, workedMin: workedMinutes(ps, now, cap) };
    });
  return NextResponse.json({ date, nowMs: now.getTime(), people });
}
