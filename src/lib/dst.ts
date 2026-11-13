// 🕰 US ⇄ Philippines DST reminder (Jon 2026-11-13). The US observes Daylight Saving (spring forward
// the 2nd Sunday of March, fall back the 1st Sunday of November); the Philippines does NOT change.
// So each US clock change shifts the US-anchored shift start by one hour in PH local time — the PH
// team needs to reset their alarm. Pure date math (UTC), no timezone library.

function nthSundayUTC(year: number, month0: number, nth: number): Date {
  const first = new Date(Date.UTC(year, month0, 1));
  const toFirstSunday = (7 - first.getUTCDay()) % 7; // days from the 1st to the first Sunday
  return new Date(Date.UTC(year, month0, 1 + toFirstSunday + (nth - 1) * 7));
}

export type DstChange = { date: string; type: "spring" | "fall"; daysUntil: number };

/** The next US DST transition on/after `now` (looks into next year so it never returns null). */
export function nextUsDstChange(now = new Date()): DstChange {
  const y = now.getUTCFullYear();
  const events: Array<{ d: Date; type: "spring" | "fall" }> = [];
  for (const yr of [y, y + 1]) {
    events.push({ d: nthSundayUTC(yr, 2, 2), type: "spring" }); // March, 2nd Sunday
    events.push({ d: nthSundayUTC(yr, 10, 1), type: "fall" });  // November, 1st Sunday
  }
  const todayMid = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const next = events.filter((e) => e.d.getTime() >= todayMid.getTime()).sort((a, b) => a.d.getTime() - b.d.getTime())[0];
  const daysUntil = Math.round((next.d.getTime() - todayMid.getTime()) / 86_400_000);
  return { date: next.d.toISOString().slice(0, 10), type: next.type, daysUntil };
}

/** Human-readable reminder for the schedule banner. */
export function dstReminder(c: DstChange): { title: string; usNote: string; phNote: string; when: string } {
  const sunday = new Date(c.date + "T00:00:00Z");
  const monday = new Date(sunday.getTime() + 86_400_000);
  const prettySun = sunday.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const prettyMon = monday.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  if (c.type === "spring") {
    return {
      title: `US Daylight Saving — clocks SPRING FORWARD ${prettySun}`,
      when: prettySun,
      usNote: "🇺🇸 US team: clocks jump ahead 1 hour at 2 AM (you lose an hour of sleep). Phones update on their own.",
      phNote: `🇵🇭 Philippines team: the US will be 1 hour AHEAD of now, so your US-time shift starts 1 HOUR EARLIER in Manila time. ⏰ Set your alarm 1 hour EARLIER starting ${prettyMon}.`,
    };
  }
  return {
    title: `US Daylight Saving — clocks FALL BACK ${prettySun}`,
    when: prettySun,
    usNote: "🇺🇸 US team: clocks go back 1 hour at 2 AM (you gain an hour). Phones update on their own.",
    phNote: `🇵🇭 Philippines team: the US will be 1 hour BEHIND of now, so your US-time shift starts 1 HOUR LATER in Manila time. ⏰ You can set your alarm 1 hour LATER starting ${prettyMon}.`,
  };
}
