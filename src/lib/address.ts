// 🧹 Address hygiene (Jon 2026-10-09): every lead address gets scrubbed into
// ONE canonical shape — "123 Main St, City, ST 12345" — no doubled zips, no
// repeated city/state, no trailing "USA". Used as the final check on every
// intake path + the ?addrscrub=1 cleanup of existing rows.

const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const ABBRS = new Set(Object.values(STATES));

export function normalizeAddress(raw: string): string {
  const input = (raw ?? "").trim();
  if (!input) return "";
  // only treat it as an address when it looks like one (starts with a street
  // number or contains a comma) — nicknames like "Smith land deal" pass through
  if (!/^\d/.test(input) && !input.includes(",")) return input;

  let tokens = input.split(",").map((t) => t.trim()).filter(Boolean)
    .filter((t) => !/^(usa|u\.s\.a\.?|us|united states( of america)?)$/i.test(t));
  if (tokens.length === 0) return input;

  let state = "";
  const zips: string[] = [];
  const clean: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i];
    // pull zips out of any token EXCEPT the street line (a 5-digit house
    // number like "15731 S Ball Ave" is not a zip)
    if (i > 0) {
      const zm = t.match(/\b(\d{5})(?:-\d{4})?\b/g);
      if (zm) { for (const z of zm) zips.push(z.slice(0, 5)); t = t.replace(/\b\d{5}(?:-\d{4})?\b/g, "").trim().replace(/[,\s]+$/, ""); }
    }
    if (!t) continue;
    // pull a state out of a trailing word or whole token
    const low = t.toLowerCase();
    if (STATES[low]) { state = STATES[low]; continue; }
    if (t.length === 2 && ABBRS.has(t.toUpperCase())) { state = t.toUpperCase(); continue; }
    const words = t.split(/\s+/);
    const lastWord = words[words.length - 1] ?? "";
    if (words.length > 1 && lastWord.length === 2 && ABBRS.has(lastWord.toUpperCase())) {
      state = lastWord.toUpperCase();
      t = words.slice(0, -1).join(" ");
    } else {
      const lastTwo = words.slice(-2).join(" ").toLowerCase();
      if (words.length > 2 && STATES[lastTwo]) { state = STATES[lastTwo]; t = words.slice(0, -2).join(" "); }
    }
    if (t) clean.push(t);
  }
  // dedupe (case-insensitive) while keeping first-seen order: kills the
  // "Irving, TX 75060, Irving, Texas, 75060" doubles from GHL imports
  const seen = new Set<string>();
  const parts = clean.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // conflicting zips (bad imports) → majority wins, first-seen breaks ties
  const freq = new Map<string, number>();
  for (const z of zips) freq.set(z, (freq.get(z) ?? 0) + 1);
  const zip = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const street = parts[0] ?? "";
  const city = parts[1] ?? "";
  if (!street) return input;
  let out = street;
  if (city) out += `, ${city}`;
  if (state || zip) out += `, ${[state, zip].filter(Boolean).join(" ")}`;
  return out;
}
