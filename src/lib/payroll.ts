// Parse an hourly rate from the roster's free-text pay scale (e.g. "$3.00/hr").
// Returns null for non-hourly people (monthly / per-deal) — pay handled separately.
export function parseHourly(payScale: string | null | undefined): number | null {
  if (!payScale) return null;
  if (!/\b(hr|hour|hourly)\b/i.test(payScale)) return null;
  const m = payScale.replace(/,/g, "").match(/([\d]+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

// Flat guaranteed hours per WEEKDAY for salaried management (e.g. Marie): she's
// paid this many hours every Mon–Fri regardless of what the clock says, but we
// still track her actual hours and flag days/weeks she comes up short. Encode it
// in the roster pay scale, e.g. "$5.00/hr · 6h flat M–F". Returns null for normal
// hourly staff (paid on actual clock time).
export function parseFlatDailyHours(payScale: string | null | undefined): number | null {
  if (!payScale || !/\bflat\b/i.test(payScale)) return null;
  // First "<n>h" token in the string (skips the "$5.00/hr" rate, which has no space+h).
  const m = payScale.match(/(\d+(?:\.\d+)?)\s*h\b/i);
  const v = m ? Number(m[1]) : null;
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

export function fmtHours(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}
