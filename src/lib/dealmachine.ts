// 🏕 DealMachine integration — research land markets + (later) pull leads straight from the
// War Room using the 10k/mo credits (Jon 2026-11-05). Property COUNTS are FREE (credits only
// burn on enrichment/skip-trace), so area research costs nothing. v2 API:
//   GET  /v1/locations?q=&type=                 → resolve a county/city/zip to its code
//   POST /v1/properties/search/count            → free counts {total_properties,total_people}
//   POST /v1/properties/search                  → list properties (for a pull)
// Auth: Authorization: Bearer <DEALMACHINE_API_KEY>. Key is Vercel-only (not on disk), so a
// diagnostic (dmPing) verifies it in prod.
const V2 = "https://api.v2.dealmachine.com/v1";

// Prefer a dedicated v2 key (dm_sk_live_…) if present, else reuse the existing key. The
// legacy /leads key may be Classic-only; if v2 fails, Jon adds DEALMACHINE_V2_KEY in Vercel
// (owner-only, per the never-ask-for-secrets rule) without touching the Classic integration.
function dmKey(): string | undefined { return process.env.DEALMACHINE_V2_KEY || process.env.DEALMACHINE_API_KEY; }
export function dmConfigured(): boolean { return !!dmKey(); }

async function dmFetch<T>(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  if (!dmConfigured()) return { ok: false, status: 0, error: "DEALMACHINE_API_KEY not set" };
  try {
    const res = await fetch(`${V2}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${dmKey()}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });
    const text = await res.text();
    let json: unknown; try { json = JSON.parse(text); } catch { json = text; }
    if (!res.ok) return { ok: false, status: res.status, error: typeof json === "string" ? json.slice(0, 200) : JSON.stringify(json).slice(0, 200) };
    return { ok: true, status: res.status, data: json as T };
  } catch (e) { return { ok: false, status: 0, error: String(e).slice(0, 160) }; }
}

export type DmLocation = { location_id: string; type: string; code: string; name: string; property_count: number; state?: string; state_name?: string };
export async function dmLocationSearch(q: string, type?: "county" | "city" | "zip_code" | "state", state?: string): Promise<DmLocation[]> {
  const p = new URLSearchParams({ q });
  if (type) p.set("type", type);
  if (state) p.set("state", state);
  p.set("per_page", "8");
  const r = await dmFetch<{ data?: DmLocation[] }>(`/locations?${p.toString()}`, { method: "GET" });
  return r.ok && r.data?.data ? r.data.data : [];
}

// ── Filter model (operators per field type, learned from the catalog) ──
export type DmFilter = { filter_id: string; operator?: string; value: unknown };
export const F = {
  multi: (id: string, ids: (number | string)[], op: "contains_any" | "contains_none" | "contains_all" = "contains_any"): DmFilter => ({ filter_id: id, operator: op, value: ids }),
  range: (id: string, min?: number, max?: number): DmFilter => ({ filter_id: id, operator: "range", value: { ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) } }),
  lte: (id: string, n: number): DmFilter => ({ filter_id: id, operator: "less_than_or_equal", value: n }),
  gte: (id: string, n: number): DmFilter => ({ filter_id: id, operator: "greater_than_or_equal", value: n }),
  bool: (id: string, v: boolean): DmFilter => ({ filter_id: id, operator: "is_boolean", value: v }),
};

export type DmLoc = { type: "county" | "city" | "zip_code" | "state"; code: string };

export type DmCount = { total_properties: number; total_people: number };
export async function dmCount(locations: DmLoc[], filters: DmFilter[]): Promise<{ ok: boolean; count?: DmCount; error?: string; status?: number }> {
  const r = await dmFetch<DmCount>("/properties/search/count", {
    method: "POST",
    body: JSON.stringify({ locations, anchor: "properties", contact_audience: "owners", filters }),
  });
  if (!r.ok) return { ok: false, error: r.error, status: r.status };
  return { ok: true, count: { total_properties: r.data!.total_properties ?? 0, total_people: r.data!.total_people ?? 0 } };
}

// ── Land buy-box → DealMachine filters (the land-course pull criteria: vacant land, lot-size
// band, little/no improvement, absentee/out-of-state owner, tax-delinquent, not landlocked,
// outside the flood hazard area). property_type: 6=Vacant Land, 19=Agriculture, 20=Dev Site. ──
export type LandFilterInput = {
  propertyTypes?: number[]; acresMin?: number; acresMax?: number; maxImprovementValue?: number;
  outOfState?: boolean; absentee?: boolean; taxDelinquent?: boolean; excludeLandlocked?: boolean; excludeFlood?: boolean;
};
export function buildLandFilters(i: LandFilterInput): DmFilter[] {
  const f: DmFilter[] = [F.multi("property_type", i.propertyTypes?.length ? i.propertyTypes : [6])];
  if (i.acresMin != null || i.acresMax != null) f.push(F.range("lot_size_acres", i.acresMin, i.acresMax));
  if (i.maxImprovementValue != null) f.push(F.lte("assessed_improvement_value", i.maxImprovementValue));
  if (i.outOfState) f.push(F.bool("has_out_of_state_owners", true));
  if (i.absentee) f.push(F.bool("has_absentee_owners", true));
  if (i.taxDelinquent) f.push(F.bool("is_tax_delinquent", true));
  if (i.excludeLandlocked) f.push(F.bool("is_landlocked", false));
  if (i.excludeFlood) f.push(F.bool("is_inside_special_flood_hazard_area", false));
  return f;
}
export const LAND_PRESETS: { key: string; label: string; emoji: string; input: LandFilterInput }[] = [
  { key: "infill", label: "Infill luxury lots", emoji: "🏝️", input: { propertyTypes: [6], acresMin: 0.1, acresMax: 1, maxImprovementValue: 5000, absentee: true, excludeLandlocked: true } },
  { key: "acreage", label: "Big acreage (rec/dev)", emoji: "🌄", input: { propertyTypes: [6, 19], acresMin: 1, acresMax: 20, outOfState: true, excludeLandlocked: true } },
  { key: "commercial", label: "Commercial / dev land", emoji: "🏗️", input: { propertyTypes: [6, 20], acresMin: 0.5, maxImprovementValue: 25000, absentee: true } },
  { key: "absentee", label: "Absentee / out-of-state", emoji: "✈️", input: { propertyTypes: [6], outOfState: true, absentee: true, excludeLandlocked: true } },
  { key: "delinquent", label: "Tax-delinquent (hot)", emoji: "🔥", input: { propertyTypes: [6], taxDelinquent: true, absentee: true } },
];

// Primary county FIPS for each seeded target market → lets us pull DealMachine's live land
// inventory per market without a location lookup each time (12 = Florida).
export const MARKET_COUNTY_FIPS: Record<string, string> = {
  "Miami / Coral Gables": "12086",              // Miami-Dade
  "Palm Beach / West Palm Beach": "12099",      // Palm Beach
  "Boca Raton / Fort Lauderdale": "12011",      // Broward
  "Naples / Port Royal": "12021",               // Collier
  "Orlando / Windermere / Winter Park": "12095",// Orange
  "Tampa Bay": "12057",                         // Hillsborough
  "Sarasota / Lakewood Ranch": "12115",         // Sarasota
  "Jacksonville / Ponte Vedra": "12031",        // Duval
  "Jupiter Island / Vero Beach": "12061",       // Indian River
  "30A / Alys Beach (NW Florida)": "12131",     // Walton
  // South Carolina (Jon 2026-11-06)
  "Bluffton / Hardeeville (Jasper)": "45053",            // Jasper
  "Hilton Head / Beaufort (Beaufort)": "45013",         // Beaufort
  "Charleston / Mount Pleasant / Daniel Island": "45019",// Charleston
  "Summerville / Nexton (Berkeley)": "45015",           // Berkeley
  "Myrtle Beach / Grand Strand (Horry)": "45051",       // Horry
  "Greenville / Greer (Upstate)": "45045",              // Greenville
  "Spartanburg (Upstate)": "45083",                     // Spartanburg
  "Rock Hill / Fort Mill (York)": "45091",              // York
  "Lake Keowee / Clemson (Oconee)": "45073",            // Oconee
  "Aiken (CSRA)": "45003",                              // Aiken
  "Columbia / Lake Murray (Lexington)": "45063",        // Lexington
};

/** Live off-market land inventory per market (free counts). Loops the markets' counties with a
 *  broad land buy-box (vacant land, 0.1–20 ac, absentee or out-of-state owner). */
export async function dmMarketInventory(): Promise<{ ok: boolean; error?: string; markets?: { name: string; fips: string; parcels: number; owners: number }[] }> {
  if (!dmConfigured()) return { ok: false, error: "key not set" };
  const filters = buildLandFilters({ propertyTypes: [6, 19, 20], acresMin: 0.1, acresMax: 20, absentee: true, excludeLandlocked: true });
  const out: { name: string; fips: string; parcels: number; owners: number }[] = [];
  let anyOk = false, firstErr = "";
  for (const [name, fips] of Object.entries(MARKET_COUNTY_FIPS)) {
    const c = await dmCount([{ type: "county", code: fips }], filters);
    if (c.ok) { anyOk = true; out.push({ name, fips, parcels: c.count!.total_properties, owners: c.count!.total_people }); }
    else { if (!firstErr) firstErr = c.error ?? "count failed"; out.push({ name, fips, parcels: -1, owners: -1 }); }
  }
  if (!anyOk) return { ok: false, error: firstErr || "all counts failed (v2 key?)" };
  return { ok: true, markets: out };
}

// ── PULL (costs credits) — property search returns parcels WITH skip-traced owner contacts.
// Each call charges credits (≈ 1/property + 1/person), so this only runs on an explicit,
// capped, confirmed pull. Normalized to the fields we import into the CRM. ──
export type DmLead = { propertyId: string; address: string; city: string; state: string; zip: string; estValue: number | null; ownerName: string; phone: string; email: string; mailing: string; dnc: boolean };
type DmContact = { full_name?: string; phones?: { number?: string; type?: string; do_not_call?: boolean; match_confidence?: number }[]; emails?: { address?: string; match_confidence?: number }[]; residence?: { full_address?: string }; contact_type?: string };
type DmProp = { dm_property_id?: string; full_address?: string; address?: string; city?: string; state?: string; zip?: string; estimated_value?: number; contacts?: DmContact[] };

function bestPhone(c: DmContact): { number: string; dnc: boolean } {
  const ps = (c.phones ?? []).filter((p) => p.number);
  // prefer a non-DNC wireless with the highest confidence, else best available
  const pick = ps.filter((p) => !p.do_not_call).sort((a, b) => (b.type === "wireless" ? 1 : 0) - (a.type === "wireless" ? 1 : 0) || (b.match_confidence ?? 0) - (a.match_confidence ?? 0))[0]
    ?? ps.sort((a, b) => (b.match_confidence ?? 0) - (a.match_confidence ?? 0))[0];
  return pick ? { number: pick.number!, dnc: !!pick.do_not_call } : { number: "", dnc: false };
}

export async function dmSearchLeads(locations: DmLoc[], filters: DmFilter[], perPage = 25): Promise<{ ok: boolean; error?: string; creditsUsed?: number; totalResults?: number; leads?: DmLead[] }> {
  const r = await dmFetch<{ data?: DmProp[]; credits?: { used?: number }; pagination?: { total_results?: number } }>("/properties/search", {
    method: "POST",
    body: JSON.stringify({ locations, anchor: "properties", contact_audience: "owners", filters, per_page: Math.min(100, Math.max(1, perPage)), page: 1 }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  const leads: DmLead[] = (r.data!.data ?? []).map((p) => {
    const owner = (p.contacts ?? []).find((c) => c.contact_type === "owner") ?? (p.contacts ?? [])[0] ?? {};
    const ph = bestPhone(owner);
    const email = (owner.emails ?? []).sort((a, b) => (b.match_confidence ?? 0) - (a.match_confidence ?? 0))[0]?.address ?? "";
    return {
      propertyId: p.dm_property_id ?? "", address: p.full_address ?? p.address ?? "", city: p.city ?? "", state: p.state ?? "", zip: p.zip ?? "",
      estValue: p.estimated_value ?? null, ownerName: owner.full_name ?? "", phone: ph.number, email, mailing: owner.residence?.full_address ?? "", dnc: ph.dnc,
    };
  });
  return { ok: true, creditsUsed: r.data!.credits?.used ?? 0, totalResults: r.data!.pagination?.total_results ?? leads.length, leads };
}

/** Diagnostic — proves the key works on the v2 API (owner-only), with a sample location lookup. */
export async function dmPing(): Promise<{ configured: boolean; locationsOk: boolean; countOk: boolean; detail: string }> {
  if (!dmConfigured()) return { configured: false, locationsOk: false, countOk: false, detail: "DEALMACHINE_API_KEY not set in Vercel" };
  const locs = await dmLocationSearch("Lee County, FL", "county", "FL");
  const locationsOk = locs.length > 0;
  let countOk = false, detail = "";
  if (locationsOk) {
    const c = await dmCount([{ type: "county", code: locs[0].code }], [F.multi("property_type", [6])]);
    countOk = c.ok;
    detail = c.ok ? `✓ v2 API live — Lee County vacant land: ${c.count!.total_properties.toLocaleString()} parcels` : `count failed: ${c.error}`;
  } else {
    detail = "locations lookup returned nothing — key may be Classic-only (needs a v2 dm_sk_live_ key)";
  }
  return { configured: true, locationsOk, countOk, detail };
}
