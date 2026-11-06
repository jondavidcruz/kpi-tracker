// 🏕 DealMachine integration — research land markets + (later) pull leads straight from the
// War Room using the 10k/mo credits (Jon 2026-11-05). Property COUNTS are FREE (credits only
// burn on enrichment/skip-trace), so area research costs nothing. v2 API:
//   GET  /v1/locations?q=&type=                 → resolve a county/city/zip to its code
//   POST /v1/properties/search/count            → free counts {total_properties,total_people}
//   POST /v1/properties/search                  → list properties (for a pull)
// Auth: Authorization: Bearer <DEALMACHINE_API_KEY>. Key is Vercel-only (not on disk), so a
// diagnostic (dmPing) verifies it in prod.
const V2 = "https://api.v2.dealmachine.com/v1";

export function dmConfigured(): boolean { return !!process.env.DEALMACHINE_API_KEY; }

async function dmFetch<T>(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  if (!dmConfigured()) return { ok: false, status: 0, error: "DEALMACHINE_API_KEY not set" };
  try {
    const res = await fetch(`${V2}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.DEALMACHINE_API_KEY}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
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
