import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
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
  const [users, punches] = await Promise.all([
    db.user.findMany({ where: { active: true, irregularSchedule: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.punch.findMany({ where: { date }, orderBy: { at: "asc" }, select: { userId: true, kind: true, at: true } }),
  ]);
  const byUser = groupByUser(punches);
  const now = new Date();
  const cap = workCapAt(date, settings.orgTimezone);
  const people = users.map((u) => {
    const ps = byUser.get(u.id) ?? [];
    const { state, since } = stateFromPunches(ps);
    return { id: u.id, name: u.name, state, sinceMs: since ? since.getTime() : null, workedMin: workedMinutes(ps, now, cap) };
  });
  return NextResponse.json({ date, nowMs: now.getTime(), people });
}
