// Parse an hourly rate from the roster's free-text pay scale (e.g. "$3.00/hr").
// Returns null for non-hourly people (monthly / per-deal) — pay handled separately.
export function parseHourly(payScale: string | null | undefined): number | null {
  if (!payScale) return null;
  if (!/\b(hr|hour|hourly)\b/i.test(payScale)) return null;
  const m = payScale.replace(/,/g, "").match(/([\d]+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function fmtHours(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}
