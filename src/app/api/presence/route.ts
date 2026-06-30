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
    db.user.findMany({ where: { active: true, irregularSchedule: false }, orderBy: { name: "asc" }, select: { id: true, name: true, lastSeenAt: true, dropAlertedAt: true, breakNudgedAt: true } }),
    db.punch.findMany({ where: { date }, orderBy: { at: "asc" }, select: { userId: true, kind: true, at: true } }),
    db.outage.findMany({ where: { date, ongoing: true }, select: { userId: true, kind: true, startMin: true } }),
  ]);
  const byUser = groupByUser(punches);
  const outByUser = new Map(outages.map((o) => [o.userId, o]));
  const now = new Date();
  const STALE = 5 * 60 * 1000; // working but no heartbeat for 5 min = likely dropped
  // Current minutes-from-midnight in the org timezone, for outage duration.
  const np = new Intl.DateTimeFormat("en-US", { timeZone: settings.orgTimezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const nowMin = (+(np.find((p) => p.type === "hour")?.value ?? 0) % 24) * 60 + +(np.find((p) => p.type === "minute")?.value ?? 0);
  const people = users
    .filter((u) => !isOwner(u))
    .map((u) => {
      const ps = byUser.get(u.id) ?? [];
      const { state, since } = stateFromPunches(ps);
      const working = state === "online" || state === "break" || state === "lunch" || state === "meeting";
      const out = outByUser.get(u.id);
      let st: string = state;
      if (out) st = "outage";
      else if (working && u.lastSeenAt && now.getTime() - new Date(u.lastSeenAt).getTime() > STALE) st = "dropped";
      const outageMin = out ? Math.max(0, nowMin - out.startMin) : null;
      return { id: u.id, name: u.name, state: st, outageKind: out?.kind ?? null, outageMin, sinceMs: since ? since.getTime() : null, workedMin: workedMinutes(ps, now, workCapAt(date, settings.orgTimezone, u.name)) };
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
        if (back === "online" || back === "break" || back === "lunch" || back === "meeting") {
          await sendTimecardChat(`🟢 *${u.name} is back online* after a disconnect. ${MARIE_MENTION} — confirm if it was a power or internet outage and log it on their record.`).catch(() => {});
        }
      }
    }
  }

  // Break nudge: anyone online ~2h45m straight (no break) gets a one-time Chat ping to step
  // away — but NOT in the morning (before noon). The team starts at 9am fresh and breaks at
  // lunch (~12–1pm), so morning nudges are just noise. Atomic guard via breakNudgedAt;
  // reset the moment they're not "online".
  const BREAK_NUDGE_MIN = 165;     // ~2h45m — between the 2.5h and 3h Jon wants (2h was too short)
  const NUDGE_AFTER_MIN = 12 * 60; // don't recommend a break before noon (org-local)
  const sinceById = new Map(people.map((p) => [p.id, p.sinceMs]));
  for (const u of users) {
    if (isOwner(u)) continue;
    const st = stateById.get(u.id);
    const sinceMs = sinceById.get(u.id);
    const contMin = st === "online" && sinceMs ? Math.floor((now.getTime() - sinceMs) / 60000) : 0;
    if (st === "online" && nowMin >= NUDGE_AFTER_MIN && contMin >= BREAK_NUDGE_MIN && !u.breakNudgedAt) {
      const won = await db.user.updateMany({ where: { id: u.id, breakNudgedAt: null }, data: { breakNudgedAt: now } });
      if (won.count === 1) await sendTimecardChat(`☕ *${u.name} has been heads-down ${Math.floor(contMin / 60)}h ${contMin % 60}m straight* — time for a quick break to reset.`).catch(() => {});
    } else if (st !== "online" && u.breakNudgedAt) {
      await db.user.updateMany({ where: { id: u.id, breakNudgedAt: { not: null } }, data: { breakNudgedAt: null } });
    }
  }

  return NextResponse.json({ date, nowMs: now.getTime(), people });
}
