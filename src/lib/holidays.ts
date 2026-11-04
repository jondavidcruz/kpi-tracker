// 🎉 US federal holidays for the time card (Jon 2026-11-04). We pre-populate the calendar so
// the team can SEE them coming (Thanksgiving, Christmas…). Whether each one is a day off is a
// CHOICE, not automatic: the 3 majors Jon named default to off (New Year's, Thanksgiving,
// Christmas); everything else defaults to a working day (he works Memorial Day, Veterans Day,
// etc.). Managers flip any of them per year; the override is stored in Resource __holidays__.
// Pure + client-safe.

export type Holiday = { key: string; name: string; emoji: string; date: string; defaultOff: boolean };

const ymd = (y: number, m0: number, d: number) => `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** nth (1-based) weekday (0=Sun…6=Sat) of month m0 (0-based) in year. */
function nthWeekday(year: number, m0: number, weekday: number, n: number): string {
  const firstDow = new Date(Date.UTC(year, m0, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
  return ymd(year, m0, day);
}
/** last given weekday of month m0. */
function lastWeekday(year: number, m0: number, weekday: number): string {
  const last = new Date(Date.UTC(year, m0 + 1, 0));
  const day = last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
  return ymd(year, m0, day);
}
const plusDays = (date: string, n: number) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** All US federal holidays (+ Black Friday) for a year, with Jon's default off/work. */
export function federalHolidays(year: number): Holiday[] {
  const thanksgiving = nthWeekday(year, 10, 4, 4); // 4th Thursday of November
  return [
    { key: "new_years", name: "New Year's Day", emoji: "🎉", date: ymd(year, 0, 1), defaultOff: true },
    { key: "mlk", name: "MLK Jr. Day", emoji: "✊", date: nthWeekday(year, 0, 1, 3), defaultOff: false },
    { key: "presidents", name: "Presidents' Day", emoji: "🎩", date: nthWeekday(year, 1, 1, 3), defaultOff: false },
    { key: "memorial", name: "Memorial Day", emoji: "🎖️", date: lastWeekday(year, 4, 1), defaultOff: false },
    { key: "juneteenth", name: "Juneteenth", emoji: "🕊️", date: ymd(year, 5, 19), defaultOff: false },
    { key: "independence", name: "Independence Day", emoji: "🎆", date: ymd(year, 6, 4), defaultOff: false },
    { key: "labor", name: "Labor Day", emoji: "🛠️", date: nthWeekday(year, 8, 1, 1), defaultOff: false },
    { key: "columbus", name: "Columbus Day", emoji: "🧭", date: nthWeekday(year, 9, 1, 2), defaultOff: false },
    { key: "veterans", name: "Veterans Day", emoji: "🎗️", date: ymd(year, 10, 11), defaultOff: false },
    { key: "thanksgiving", name: "Thanksgiving", emoji: "🦃", date: thanksgiving, defaultOff: true },
    { key: "black_friday", name: "Day after Thanksgiving", emoji: "🛍️", date: plusDays(thanksgiving, 1), defaultOff: false },
    { key: "christmas", name: "Christmas Day", emoji: "🎄", date: ymd(year, 11, 25), defaultOff: true },
  ];
}

export type HolidayOverrides = Record<string, boolean>; // date → isOff (overrides the default)

/** Is this calendar date a team day off? Override (by date) wins over the holiday's default. */
export function isDayOff(date: string, overrides: HolidayOverrides, year?: number): boolean {
  if (date in overrides) return overrides[date];
  const y = year ?? Number(date.slice(0, 4));
  const h = federalHolidays(y).find((x) => x.date === date);
  return h ? h.defaultOff : false;
}

/** Upcoming holidays from `fromDate` forward, across this year + next (so Dec shows January). */
export function upcomingHolidays(fromDate: string, overrides: HolidayOverrides, limit = 8): Array<Holiday & { off: boolean }> {
  const y = Number(fromDate.slice(0, 10).slice(0, 4));
  const all = [...federalHolidays(y), ...federalHolidays(y + 1)];
  return all
    .filter((h) => h.date >= fromDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit)
    .map((h) => ({ ...h, off: h.date in overrides ? overrides[h.date] : h.defaultOff }));
}
