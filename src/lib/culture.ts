// Culture date helpers — upcoming birthdays + work anniversaries from stored dates.
// Birthdays are stored "MM-DD" (year-agnostic); hire dates "YYYY-MM-DD".

export type Person = { name: string; birthday: string | null; hireDate: string | null };
export type Upcoming = {
  name: string;
  kind: "birthday" | "anniversary";
  raw: string;          // the stored value
  mmdd: string;         // "MM-DD"
  daysUntil: number;    // 0 = today
  years?: number;       // anniversary: years of service on the next occurrence
};

/** Days until the next occurrence of MM-DD, and the calendar year it lands in. */
function nextOccur(mmdd: string, todayStr: string): { days: number; year: number } {
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [mm, dd] = mmdd.split("-").map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  let year = ty;
  let next = Date.UTC(year, mm - 1, dd);
  if (next < today) { year = ty + 1; next = Date.UTC(year, mm - 1, dd); }
  return { days: Math.round((next - today) / 86400000), year };
}

export function upcomingCulture(people: Person[], todayStr: string, windowDays = 60): Upcoming[] {
  const out: Upcoming[] = [];
  for (const p of people) {
    if (p.birthday && /^\d{2}-\d{2}$/.test(p.birthday)) {
      const { days } = nextOccur(p.birthday, todayStr);
      if (days <= windowDays) out.push({ name: p.name, kind: "birthday", raw: p.birthday, mmdd: p.birthday, daysUntil: days });
    }
    if (p.hireDate && /^\d{4}-\d{2}-\d{2}$/.test(p.hireDate)) {
      const mmdd = p.hireDate.slice(5);
      const { days, year } = nextOccur(mmdd, todayStr);
      const years = year - Number(p.hireDate.slice(0, 4));
      if (days <= windowDays && years >= 1) out.push({ name: p.name, kind: "anniversary", raw: p.hireDate, mmdd, daysUntil: days, years });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function prettyMMDD(mmdd: string): string {
  const [mm, dd] = mmdd.split("-").map(Number);
  return `${MONTHS[mm - 1]} ${dd}`;
}
export function whenLabel(days: number): string {
  if (days === 0) return "Today 🎉";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return `in ${days} days`;
  return `in ${days} days`;
}
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
