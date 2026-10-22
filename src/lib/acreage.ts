// ⛰️ Acreage parsing + search (Jon 2026-10-22). Land deals live or die on parcel
// SIZE — when an agent says "my buyer wants 5–10 acre parcels", dispo needs to
// answer "do we have that?" in seconds. These helpers turn the free-text acreage
// field (land.acreage — "5", "5.5 acres", "217,800 sqft", "10 ac") into a number,
// and turn a search box query ("5-10 acres", ">10 ac", "~5 acre") into a range.

const SQFT_PER_ACRE = 43560;

/** Pull a usable acreage number off a deal's formData. Reads land.acreage first
 *  (the intake field), then land.lotSqFt, then the property.* equivalents. Handles
 *  "5 acres", "5.5", "217,800 sq ft", "10ac" — sq-ft values convert to acres.
 *  Accepts Prisma's JsonValue (unknown) so callers can pass o.formData directly. */
export function parseAcres(formData: unknown): number | null {
  const fd = (formData ?? {}) as { land?: Record<string, unknown>; property?: Record<string, unknown> };
  const land = (fd.land ?? {}) as Record<string, unknown>;
  const prop = (fd.property ?? {}) as Record<string, unknown>;
  const acreRaw = land.acreage ?? land.acres ?? prop.acreage ?? prop.acres;
  const ac = fromAcreString(acreRaw);
  if (ac != null) return ac;
  // Fall back to a square-footage field → acres.
  const sqftRaw = land.lotSqFt ?? land.sqft ?? prop.lotSqFt ?? prop.sqft;
  const sqft = toNum(sqftRaw);
  if (sqft != null && sqft > 0) return round2(sqft / SQFT_PER_ACRE);
  return null;
}

function fromAcreString(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).toLowerCase();
  if (!s.trim()) return null;
  // Explicit sq-ft value in the acreage field → convert.
  if (/sq\s*\.?\s*(ft|feet)|sqft|\bsf\b/.test(s)) {
    const n = toNum(s);
    return n != null && n > 0 ? round2(n / SQFT_PER_ACRE) : null;
  }
  const n = toNum(s);
  return n != null && n >= 0 ? round2(n) : null;
}

function toNum(raw: unknown): number | null {
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  if (raw == null) return null;
  const m = String(raw).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "5 ac" / "0.34 ac" — compact chip label. */
export function fmtAcres(n: number | null | undefined): string {
  if (n == null) return "";
  return `${n % 1 === 0 ? n : round2(n)} ac`;
}

export type AcreQuery = { min?: number; max?: number; matched: boolean; rest: string };

/** Interpret a search box that may contain an acre filter alongside text.
 *  Returns {min,max} plus `rest` (the query with the acre tokens stripped, for the
 *  normal text match) and `matched` (whether any acre token was found).
 *  Understands: "5-10 ac", "5 to 10 acres", ">10 acres", "10+ ac", "under 5 acres",
 *  "<2 ac", "~5 acres" / "5 acre" (single value → ±15% tolerance window). */
export function parseAcreQuery(q: string): AcreQuery {
  const s = (q || "").toLowerCase();
  const U = "(?:ac\\b|acres?\\b)"; // an acre unit must be present so we never hijack an address number
  let rest = s;
  const strip = (re: RegExp) => { rest = rest.replace(re, " ").replace(/\s+/g, " ").trim(); };

  // range: 5-10 ac | 5 to 10 acres
  let m = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?)\\s*${U}`));
  if (m) { strip(new RegExp(`${m[1]}\\s*(?:-|–|to)\\s*${m[2]}\\s*${U}`)); return { min: Number(m[1]), max: Number(m[2]), matched: true, rest }; }

  // minimum: >10 ac | 10+ ac | over 10 acres | at least 10 acres | 10 acres+
  m = s.match(new RegExp(`(?:>|over|at least|min(?:imum)?\\s*)\\s*(\\d+(?:\\.\\d+)?)\\s*${U}`))
    || s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*\\+\\s*${U}`))
    || s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${U}\\s*\\+`));
  if (m) { strip(new RegExp(`(?:>|over|at least|min(?:imum)?|\\+)?\\s*${m[1]}\\s*\\+?\\s*${U}\\s*\\+?`)); return { min: Number(m[1]), matched: true, rest }; }

  // maximum: <5 ac | under 5 acres | up to 5 acres | max 5 acres
  m = s.match(new RegExp(`(?:<|under|up to|max(?:imum)?\\s*|below)\\s*(\\d+(?:\\.\\d+)?)\\s*${U}`));
  if (m) { strip(new RegExp(`(?:<|under|up to|max(?:imum)?|below)?\\s*${m[1]}\\s*${U}`)); return { max: Number(m[1]), matched: true, rest }; }

  // single value: "~5 acres" / "5 acre" / "5 ac" → tolerance window so near matches show
  m = s.match(new RegExp(`~?\\s*(\\d+(?:\\.\\d+)?)\\s*${U}`));
  if (m) { const v = Number(m[1]); const pad = Math.max(0.25, v * 0.15); strip(new RegExp(`~?\\s*${m[1]}\\s*${U}`)); return { min: round2(v - pad), max: round2(v + pad), matched: true, rest }; }

  return { matched: false, rest: s };
}

/** Does an acreage fall within an (optional) min/max range? Null acreage never
 *  matches an active acre filter (unknown size ≠ a size the buyer asked for). */
export function acreInRange(acres: number | null | undefined, min?: number, max?: number): boolean {
  if (min == null && max == null) return true;
  if (acres == null) return false;
  if (min != null && acres < min) return false;
  if (max != null && acres > max) return false;
  return true;
}
