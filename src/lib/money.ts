// 💵 One place to read and show dollar amounts (Jon 2026-11-04: "always show the $ and the
// right format — some say just 13k"). People type money loosely: "13k", "$13,000", "1.2m",
// "13000". parseLooseMoney understands all of those; fmtDollars prints one clean "$13,000".
// Pure + client-safe.

/** Parse a loosely-typed dollar amount to a number. Handles $, commas, spaces, and
 *  k / m / b suffixes (case-insensitive): "13k" → 13000, "1.2m" → 1200000. Returns null
 *  when there's no number to read. */
export function parseLooseMoney(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = String(input).trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*([kmb]?)/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : m[2] === "b" ? 1_000_000_000 : 1;
  n = n * mult;
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** "$13,000" — rounded, comma-grouped, always with the $. Empty string for null. */
export function fmtDollars(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
