// 🧹 Address hygiene — ONE canonical shape everywhere in the CRM:
//
//     "123 Main St, City, ST 12345"
//
// v1 (Jon 2026-10-09) killed doubled zips / repeated city-state / trailing USA.
// v2 (Jon 2026-10-19: "like a grammar professor — always polished, clean and
// similar") adds Title Case for ALL-CAPS / lowercase imports, USPS-style suffix
// and direction abbreviations (Drive → Dr, NORTH → N), full state names → codes,
// comma-less "1010 Sunset Blvd Los Angeles CA 90026", and "Phoenix AZ 85004" in
// one comma part. Idempotent: a clean address comes back unchanged. Anything that
// isn't a street address (a person's name, "APN 123-45", "Smith land deal") is
// returned trimmed and otherwise untouched — never "fix" what isn't one.
// Client-safe, no imports. Used on every intake path, at render time on cards,
// and by the ?addrscrub=1 cleanup of existing rows.

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const ABBRS = new Set(Object.values(STATES));

// Stay UPPER in Title Case: directions + highway/route designators.
const KEEP_UPPER = new Set(["NE", "NW", "SE", "SW", "N", "S", "E", "W", "US", "PO", "FM", "RR", "CR", "SR", "SH", "IH", "APN"]);
// Suffix spellings → USPS-style abbreviations, so "Drive" / "DRIVE" / "Dr." all read "Dr".
const SUFFIX: Record<string, string> = {
  street: "St", st: "St", avenue: "Ave", ave: "Ave", av: "Ave", boulevard: "Blvd", blvd: "Blvd", drive: "Dr", dr: "Dr",
  road: "Rd", rd: "Rd", lane: "Ln", ln: "Ln", court: "Ct", ct: "Ct", circle: "Cir", cir: "Cir", place: "Pl", pl: "Pl",
  trail: "Trl", trl: "Trl", parkway: "Pkwy", pkwy: "Pkwy", highway: "Hwy", hwy: "Hwy", way: "Way", terrace: "Ter", ter: "Ter",
  loop: "Loop", run: "Run", pass: "Pass", path: "Path", cove: "Cv", cv: "Cv", point: "Pt", pt: "Pt", ridge: "Rdg", rdg: "Rdg",
  square: "Sq", sq: "Sq", crossing: "Xing", xing: "Xing", expressway: "Expy", expy: "Expy", freeway: "Fwy", fwy: "Fwy",
};
const DIRECTION: Record<string, string> = { north: "N", south: "S", east: "E", west: "W", northeast: "NE", northwest: "NW", southeast: "SE", southwest: "SW" };

function titleWord(w: string): string {
  const bare = w.replace(/[^A-Za-z0-9#'-]/g, "");
  if (!bare) return w;
  if (/^\d+(st|nd|rd|th)$/i.test(bare)) return bare.toLowerCase();          // 2nd, 14th
  if (/^\d/.test(bare) || bare.startsWith("#")) return bare;                  // 2526, #4, 12B
  if (KEEP_UPPER.has(bare.toUpperCase()) && bare.length <= 3) return bare.toUpperCase();
  if (/^(mc|mac)[a-z]/i.test(bare) && bare.length > 3) {                       // McKinney, MacArthur
    const p = /^mc/i.test(bare) ? 2 : 3;
    return bare.slice(0, 1).toUpperCase() + bare.slice(1, p).toLowerCase() + bare.slice(p, p + 1).toUpperCase() + bare.slice(p + 1).toLowerCase();
  }
  // O'Brien / Winston-Salem: capitalize each piece
  return bare.split(/([-'])/).map((piece) => (piece === "-" || piece === "'") ? piece : piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase()).join("");
}
const titleCaseWords = (s: string) => s.split(/\s+/).filter(Boolean).map(titleWord).join(" ");

/** Street line: Title Case + standard suffix/direction abbreviations, no stray periods. */
function formatStreet(s: string): string {
  const words = s.replace(/\./g, "").split(/\s+/).filter(Boolean);
  return words.map((w, i) => {
    const lw = w.toLowerCase();
    if (i > 0 && DIRECTION[lw]) return DIRECTION[lw];
    if (i > 0 && SUFFIX[lw]) return SUFFIX[lw];
    return titleWord(w);
  }).join(" ");
}

const ZIP_RE = /^\d{5}(-\d{4})?$/;
const isZip = (t: string) => ZIP_RE.test(t);
const asState = (t: string): string | null => {
  const clean = t.replace(/\./g, "").trim();
  if (/^[A-Za-z]{2}$/.test(clean) && ABBRS.has(clean.toUpperCase())) return clean.toUpperCase();
  return STATES[clean.toLowerCase()] ?? null;
};
const isCountry = (t: string) => /^(usa|us|u\.s\.a?\.?|united states( of america)?)$/i.test(t.trim());

/** Does this look like a street address at all? (house number / PO Box, or comma parts with a state or zip) */
export function looksLikeAddress(raw: string): boolean {
  const s = (raw || "").trim();
  if (!s || /^apn\b/i.test(s)) return false;
  if (/^\d{1,7}[A-Za-z]?\s+\S/.test(s) || /^p\.?o\.?\s*box\b/i.test(s)) return true;
  if (!s.includes(",")) return false;
  return s.split(",").slice(1).some((p) => { const t = p.trim().split(/\s+/); return t.some(isZip) || !!asState(p) || (t.length === 2 && !!asState(t[0]) && isZip(t[1])); });
}

/**
 * Canonical "Street, City, ST ZIP" — each part exactly once. Idempotent.
 * Non-addresses come back trimmed only.
 */
export function formatAddress(raw: string | null | undefined): string {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!s || !looksLikeAddress(s)) return s;

  // Comma-less "1010 Sunset Blvd Los Angeles CA 90026" → cut after the LAST suffix word.
  let parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    const toks = s.split(/\s+/);
    const n = toks.length;
    const tailZip = isZip(toks[n - 1]) ? toks[n - 1] : "";
    const stIdx = tailZip ? n - 2 : n - 1;
    const tailState = stIdx > 0 ? asState(toks[stIdx]) : null;
    if (tailState && (tailZip || stIdx < n - 1)) {
      const body = toks.slice(0, stIdx);
      let cut = -1;
      for (let i = body.length - 1; i >= 1; i--) {
        const lw = body[i].toLowerCase().replace(/\./g, "");
        if (SUFFIX[lw]) { cut = i; if (i + 1 < body.length && DIRECTION[body[i + 1].toLowerCase()]) cut = i + 1; break; }
      }
      if (cut > 0 && cut < body.length - 1) parts = [body.slice(0, cut + 1).join(" "), body.slice(cut + 1).join(" "), `${tailState} ${tailZip}`.trim()];
    }
  }
  if (parts.length === 1) return formatStreet(parts[0]);

  // "Phoenix AZ 85004" / "Dallas 75201" in ONE part → peel the state/zip off the end.
  parts = parts.flatMap((p, idx) => {
    if (idx === 0) return [p]; // never touch the street line (a 5-digit house number is not a zip)
    const t = p.split(/\s+/);
    if (t.length >= 3 && isZip(t[t.length - 1]) && asState(t[t.length - 2])) return [t.slice(0, -2).join(" "), `${t[t.length - 2]} ${t[t.length - 1]}`];
    if (t.length >= 2 && isZip(t[t.length - 1]) && !asState(t.slice(0, -1).join(" "))) return [t.slice(0, -1).join(" "), t[t.length - 1]];
    return [p];
  });

  const street = formatStreet(parts[0]);
  let city = "";
  let state = "";
  const zips: string[] = [];
  const extras: string[] = []; // unclassified (e.g. a county) — kept once, after the city

  for (const p0 of parts.slice(1)) {
    if (isCountry(p0)) continue;
    const toks = p0.split(/\s+/).filter(Boolean);
    // "TX 75069" / "Texas 75069" / "75069 TX" / "TX" / "75069"
    if (toks.length <= 3) {
      const zipTok = toks.find(isZip);
      const rest = toks.filter((t) => t !== zipTok);
      const st = rest.length === 0 ? null : asState(rest.join(" "));
      if (zipTok && (st || rest.length === 0)) { zips.push(zipTok); if (st) state = state || st; continue; }
      if (!zipTok && st) { state = state || st; continue; }
    }
    const tc = titleCaseWords(p0);
    if (!city) { city = tc; continue; }
    if (tc.toLowerCase() === city.toLowerCase()) continue;                 // "Irving, …, Irving" doubles
    if (street.toLowerCase().includes(tc.toLowerCase())) continue;          // GHL sometimes repeats the street
    if (!extras.some((e) => e.toLowerCase() === tc.toLowerCase())) extras.push(tc);
  }

  // Conflicting zips from bad imports → majority wins, first-seen breaks ties. ZIP+4 wins over its 5-digit twin.
  const freq = new Map<string, number>();
  for (const z of zips) { const k = z.slice(0, 5); freq.set(k, (freq.get(k) ?? 0) + 1); }
  const zip5 = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const zip = zips.find((z) => z.startsWith(zip5) && z.length > 5) ?? zip5;

  const tail = [state, zip].filter(Boolean).join(" ");
  return [street, city, ...extras, tail].filter(Boolean).join(", ");
}

/** Original name, kept for every existing caller (intake paths + ?addrscrub). */
export const normalizeAddress = formatAddress;
