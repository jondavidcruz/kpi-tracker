// Phase 8: cached fetch for public due-diligence APIs. Every call is keyed by
// source + a hash of its input and stored in DiligenceCache (TTL 90 days), so
// regenerating a packet is free and we never hammer FEMA/USFWS/USDA/Regrid.
import crypto from "crypto";
import { db } from "@/lib/db";

const TTL_MS = 90 * 86400000;

export function cacheKey(source: string, input: unknown): string {
  return `${source}|${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32)}`;
}

export async function fetchCached<T>(
  source: string,
  input: unknown,
  fetcher: () => Promise<T>,
): Promise<T> {
  const key = cacheKey(source, input);
  const hit = await db.diligenceCache.findUnique({ where: { key } }).catch(() => null);
  if (hit && Date.now() - hit.createdAt.getTime() < TTL_MS) return hit.payload as T;
  const fresh = await fetcher();
  // upsert (a stale row gets replaced; createdAt resets via delete-free update)
  await db.diligenceCache.upsert({
    where: { key },
    create: { key, source, payload: fresh as never },
    update: { payload: fresh as never, createdAt: new Date() },
  }).catch(() => {});
  return fresh;
}

/** Plain JSON GET with a UA (Nominatim/USGS want one) and a hard timeout. */
export async function getJson<T>(url: string, init?: RequestInit, timeoutMs = 20000): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": "FreedomOffers-WarRoom/1.0 (info@freedom-offers.com)", Accept: "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  // Redact credentials from error text — URLs can carry ?token=/&key= params.
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).replace(/eyJ[A-Za-z0-9_.-]+/g, "***").slice(0, 160);
    throw new Error(`${res.status} ${url.replace(/([?&](token|key|secret)=)[^&]+/gi, "$1***").slice(0, 100)} :: ${body}`);
  }
  return (await res.json()) as T;
}
