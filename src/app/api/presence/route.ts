import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { stateFromPunches, workedMinutes, groupByUser } from "@/lib/presence";
import { workCapAt } from "@/lib/shift";
import { sendTimecardChat } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Tag Marie in the Timecard Google Chat space so she's pinged to review disconnects.
// Google Chat webhooks only resolve an @mention by NUMERIC user id — an email renders
// as plain text. Set MARIE_CHAT_MENTION in Vercel to "<users/123456789>" (her numeric id)
// to make it actually ping her; until then we post a readable "@Marie" tag.
const MARIE_MENTION = process.env.MARIE_CHAT_MENTION || "*@Marie (rosemae08@gmail.com)*";

/** Live availability board data — polled by the Schedule page's PresenceBoard. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const [users, punches, outages] = await Promise.all([
    db.user.findMany({ where: { active: true, irregularSchedule: false }, orderBy: { name: "asc" }, select: { id: true, name: true, lastSeenAt: true, dropAlertedAt: true } }),
    db.punch.findMany({ where: { date }, orderBy: { at: "asc" }, select: { userId: true, kind: true, at: true } }),
    db.outage.findMany({ where: { date, ongoing: true }, select: { userId: true, kind: true, startMin: true } }),
  ]);
  const byUser = groupByUser(punches);
  const outByUser = new Map(outages.map((o) => [o.userId, o]));
  const now = new Date();
  const STALE = 5 * 60 * 1000; // working but no heartbeat for 5 min = likely dropped
  const cap = workCapAt(date, settings.orgTimezone);
  // Current minutes-from-midnight in the org timezone, for outage duration.
  const np = new Intl.DateTimeFormat("en-US", { timeZone: settings.orgTimezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const nowMin = (+(np.find((p) => p.type === "hour")?.value ?? 0) % 24) * 60 + +(np.find((p) => p.type === "minute")?.value ?? 0);
  const people = users
    .filter((u) => !isOwner(u))
    .map((u) => {
      const ps = byUser.get(u.id) ?? [];
      const { state, since } = stateFromPunches(ps);
      const working = state === "online" || state === "break" || state === "lunch";
      const out = outByUser.get(u.id);
      let st: string = state;
      if (out) st = "outage";
      else if (working && u.lastSeenAt && now.getTime() - new Date(u.lastSeenAt).getTime() > STALE) st = "dropped";
      const outageMin = out ? Math.max(0, nowMin - out.startMin) : null;
      return { id: u.id, name: u.name, state: st, outageKind: out?.kind ?? null, outageMin, sinceMs: since ? since.getTime() : null, workedMin: workedMinutes(ps, now, cap) };
    });

  // Disconnect alerts: a rep who dropped mid-shift with NO logged power/internet outage
  // gets a one-time Chat alert (tag Marie); when they return, a follow-up to confirm.
  // updateMany acts as an atomic guard so concurrent polls only fire once.
  const stateById = new Map(people.map((p) => [p.id, p.state]));
  for (const u of users) {
    if (isOwner(u)) continue;
    const dropped = stateById.get(u.id) === "dropped";
    if (dropped && !u.dropAlertedAt) {
      const won = await db.user.updateMany({ where: { id: u.id, dropAlertedAt: null }, data: { dropAlertedAt: now } });
      if (won.count === 1) {
        await sendTimecardChat(`🔴 *${u.name} disconnected — unknown reason.* Dropped off mid-shift with no power/internet outage logged. ${MARIE_MENTION} — confirm with them when they're back whether it was a power or internet outage, and log it.`).catch(() => {});
      }
    } else if (!dropped && u.dropAlertedAt) {
      const won = await db.user.updateMany({ where: { id: u.id, dropAlertedAt: { not: null } }, data: { dropAlertedAt: null } });
      if (won.count === 1) {
        const back = stateById.get(u.id);
        if (back === "online" || back === "break" || back === "lunch") {
          await sendTimecardChat(`🟢 *${u.name} is back online* after a disconnect. ${MARIE_MENTION} — confirm if it was a power or internet outage and log it on their record.`).catch(() => {});
        }
      }
    }
  }

  return NextResponse.json({ date, nowMs: now.getTime(), people });
}
