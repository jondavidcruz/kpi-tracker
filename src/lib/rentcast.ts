// RentCast — comps + value estimates for underwriting. EVERY call goes through
// rentcastGet(), which enforces a HARD monthly cap (Jon 2026-10-04: free tier
// is 50 requests/month, anything past that bills the card — so the War Room
// refuses call #51 instead of ever spending money). Usage ledger lives in
// Resource __rentcast_usage__ as {"2026-10": n, log:[...]}.
import { db } from "@/lib/db";

export const RENTCAST_MONTHLY_CAP = 50;
const USAGE_CAT = "__rentcast_usage__";

export function rentcastConfigured(): boolean {
  return Boolean(process.env.RENTCAST_API_KEY);
}

type Usage = Record<string, number> & { log?: Array<{ at: string; what: string; by: string }> };

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function rentcastUsage(): Promise<{ used: number; cap: number; month: string }> {
  const row = await db.resource.findFirst({ where: { category: USAGE_CAT } }).catch(() => null);
  let u: Usage = {};
  try { u = JSON.parse(row?.description || "{}"); } catch { /* fresh */ }
  return { used: Number(u[monthKey()] ?? 0), cap: RENTCAST_MONTHLY_CAP, month: monthKey() };
}

async function recordUse(what: string, by: string): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: USAGE_CAT } });
  let u: Usage = {};
  try { u = JSON.parse(row?.description || "{}"); } catch { /* fresh */ }
  const mk = monthKey();
  u[mk] = Number(u[mk] ?? 0) + 1;
  u.log = [{ at: new Date().toISOString(), what: what.slice(0, 80), by }, ...(u.log ?? [])].slice(0, 25);
  const description = JSON.stringify(u);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "rentcast-usage", category: USAGE_CAT, url: "", description } });
}

export class RentcastCapError extends Error {
  constructor(used: number) { super(`RentCast monthly cap reached (${used}/${RENTCAST_MONTHLY_CAP}) — resets on the 1st. Raising the cap would mean real charges, so the War Room refuses instead.`); }
}

/** The ONLY way out to api.rentcast.io. Counts the request BEFORE sending
 *  (an errored request still bills on their side), refuses past the cap. */
async function rentcastGet<T>(path: string, params: Record<string, string>, by: string): Promise<T> {
  if (!rentcastConfigured()) throw new Error("RENTCAST_API_KEY not set");
  const { used } = await rentcastUsage();
  if (used >= RENTCAST_MONTHLY_CAP) throw new RentcastCapError(used);
  await recordUse(`${path}?${params.address ?? ""}`, by);
  const url = new URL(`https://api.rentcast.io/v1${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { "X-Api-Key": process.env.RENTCAST_API_KEY!, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 160);
    throw new Error(`RentCast ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

export type RcComp = {
  address: string;
  price: number | null;
  sqft: number | null;
  lotSize: number | null; // sqft
  bedrooms: number | null;
  propertyType: string;
  daysOnMarket: number | null;
  distance: number | null; // miles
};
export type RcEstimate = { value: number | null; low: number | null; high: number | null; comps: RcComp[] };

/** Value estimate + comparables for an address (1 API call). propertyType
 *  "Land" steers comps to parcels for the land tabs. */
export async function rentcastValue(address: string, by: string, propertyType?: string): Promise<RcEstimate> {
  type Resp = {
    price?: number; priceRangeLow?: number; priceRangeHigh?: number;
    comparables?: Array<{ formattedAddress?: string; price?: number; squareFootage?: number; lotSize?: number; bedrooms?: number; propertyType?: string; daysOnMarket?: number; distance?: number }>;
  };
  const params: Record<string, string> = { address, compCount: "5" };
  if (propertyType) params.propertyType = propertyType;
  const r = await rentcastGet<Resp>("/avm/value", params, by);
  return {
    value: r.price ?? null,
    low: r.priceRangeLow ?? null,
    high: r.priceRangeHigh ?? null,
    comps: (r.comparables ?? []).map((c) => ({
      address: c.formattedAddress ?? "",
      price: c.price ?? null,
      sqft: c.squareFootage ?? null,
      lotSize: c.lotSize ?? null,
      bedrooms: c.bedrooms ?? null,
      propertyType: c.propertyType ?? "",
      daysOnMarket: c.daysOnMarket ?? null,
      distance: c.distance != null ? Math.round(c.distance * 100) / 100 : null,
    })),
  };
}
