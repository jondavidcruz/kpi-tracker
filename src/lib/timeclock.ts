import { db } from "./db";
import { getSettings } from "./data";
import { isOpenSession } from "./presence";
import { workCapAt, shiftEndAt, SHIFT_GRACE_MIN, MAX_OPEN_SESSION_MIN } from "./shift";

/**
 * Auto-close any time-card session that was left open past its scheduled shift.
 *
 * This is the safety net for the "clocked in, forgot to clock out, went on
 * vacation" case. It scans the last few days of punches and, for any person
 * still clocked in on a day whose shift has ended (+ grace), inserts an `out`
 * punch stamped at the shift end so the record closes cleanly and worked time
 * stops there. Idempotent — a day already closed is skipped.
 *
 * Returns the number of sessions it closed.
 */
export async function autoCloseAbandonedSessions(now: Date = new Date()): Promise<number> {
  const settings = await getSettings();
  const tz = settings.orgTimezone;

  // Look back a few days so a Monday clock-in gets closed even on Friday.
  const since = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const sinceDate = since.toISOString().slice(0, 10);

  const punches = await db.punch.findMany({
    where: { date: { gte: sinceDate } },
    orderBy: { at: "asc" },
    select: { userId: true, date: true, kind: true, at: true },
  });
  // userId → name, so per-person shift ends (e.g. Marie's 7pm) apply to the cap.
  const nameById = new Map((await db.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  // Group by user|date.
  const byKey = new Map<string, { kind: string; at: Date }[]>();
  for (const p of punches) {
    const k = `${p.userId}|${p.date}`;
    const arr = byKey.get(k) ?? [];
    arr.push({ kind: p.kind, at: p.at });
    byKey.set(k, arr);
  }

  let closed = 0;
  for (const [key, ps] of byKey) {
    if (!isOpenSession(ps)) continue;
    const [userId, date] = key.split("|");
    const who = nameById.get(userId);

    // Cap = scheduled shift end + grace; weekends fall back to a flat ceiling
    // from the first clock-in of that day.
    let capAt = workCapAt(date, tz, who);
    if (!capAt) {
      const firstIn = ps[0]?.at;
      if (firstIn) capAt = new Date(firstIn.getTime() + MAX_OPEN_SESSION_MIN * 60000);
    }
    if (!capAt || now.getTime() <= capAt.getTime()) continue; // shift not over yet — leave it

    // Stamp the auto clock-out at the scheduled shift end (not now), so payroll
    // reflects the shift, not the moment the cron happened to run.
    const stampAt = shiftEndAt(date, tz, who) ?? new Date(capAt.getTime() - SHIFT_GRACE_MIN * 60000);
    await db.punch.create({ data: { userId, date, kind: "out", at: stampAt } });
    closed++;
  }
  return closed;
}
