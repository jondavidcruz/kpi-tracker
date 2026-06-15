// EOS helpers — quarter math for Rocks and the Level 10 meeting.

/** "YYYY-MM-DD" → "YYYY-Q#". */
export function quarterOf(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return `${y}-Q${q}`;
}

/** End date (last day) of the quarter that contains "YYYY-MM-DD". */
export function quarterEnd(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  const endMonth = q * 3; // 3, 6, 9, 12
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][endMonth];
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const d = endMonth === 2 && leap ? 29 : daysInMonth;
  return `${y}-${String(endMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "2026-Q2" → "Q2 2026" for display. */
export function quarterLabel(q: string): string {
  const [y, qq] = q.split("-");
  return qq && y ? `${qq} ${y}` : q;
}
