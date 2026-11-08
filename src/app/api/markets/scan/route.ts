import { NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { dmConfigured } from "@/lib/dealmachine";
import {
  buildZillowCounties, landProfileFor, scoreCounties, readScan, writeScan,
  type CountyScan, type ScanStore,
} from "@/lib/market-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 🔎 Market Finder scan — county-wide opportunity scan from free public data.
//   GET                → the cached scan (built on first call if empty)
//   GET ?refresh=1     → rebuild Zillow + score (managers), re-using any land already pulled
//   GET ?refresh=1&land=1 → also enrich land value buckets (DealMachine free counts), time-boxed
//   GET ?secret=…&refresh=1&land=1 → same, for the daily cron (no session)
// Manager session OR the CRON secret. In PUBLIC_PATHS so the proxy lets the cron through.
function secretOk(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

const LAND_TTL_MS = 14 * 86_400_000; // re-pull a county's land profile at most every 2 weeks

export async function GET(req: Request) {
  const me = await getCurrentUser();
  const isMgr = isManager(me);
  const cron = secretOk(req);
  if (!isMgr && !cron) return NextResponse.json({ error: "managers only" }, { status: 403 });

  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const doLand = url.searchParams.get("land") === "1";
  const states = (url.searchParams.get("states") || "FL,SC").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  // Plain read — return the cache (build a Zillow-only scan if there isn't one yet).
  if (!refresh) {
    const cached = await readScan();
    if (cached) return NextResponse.json({ ok: true, cached: true, ...cached });
    try {
      const { counties, zillowAsOf } = await buildZillowCounties(states);
      const scored = scoreCounties(counties);
      const store: ScanStore = { asOf: new Date().toISOString(), zillowAsOf, landConfigured: dmConfigured(), landDone: 0, counties: scored };
      await writeScan(store);
      return NextResponse.json({ ok: true, cached: false, ...store });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `zillow fetch failed: ${String(e).slice(0, 120)}` }, { status: 502 });
    }
  }

  // Refresh. Only managers or the cron reach here.
  const started = Date.now();
  let zillow;
  try { zillow = await buildZillowCounties(states); }
  catch (e) { return NextResponse.json({ ok: false, error: `zillow fetch failed: ${String(e).slice(0, 120)}` }, { status: 502 }); }
  const counties = zillow.counties;

  // Carry forward land profiles already pulled (keyed by FIPS) so a refresh never loses them.
  const prior = await readScan();
  const priorLand = new Map<string, CountyScan["land"]>((prior?.counties ?? []).map((c) => [c.fips, c.land]));
  for (const c of counties) { const l = priorLand.get(c.fips); if (l) c.land = l; }

  // Land enrichment (free counts) — only when the v2 key is live and asked for. Time-boxed so a
  // serverless invocation never exceeds the 60s cap: enrich the highest-priced counties first
  // (where $100k+ land actually exists), skipping any whose land was pulled within the TTL.
  let landDone = prior?.landDone ?? 0;
  if (doLand && dmConfigured()) {
    const now = Date.now();
    const queue = [...counties]
      .filter((c) => c.state === "FL" && (!c.land || now - new Date(c.land.asOf).getTime() > LAND_TTL_MS)) // FL-only: SC uses an assessment ratio
      .sort((a, b) => (b.medianSalePrice ?? 0) - (a.medianSalePrice ?? 0));
    landDone = 0;
    for (const c of queue) {
      if (Date.now() - started > 45_000) break; // leave headroom under maxDuration
      const lp = await landProfileFor(c.fips).catch(() => null);
      if (lp) { c.land = lp; landDone++; }
    }
  }

  const scored = scoreCounties(counties);
  const store: ScanStore = {
    asOf: new Date().toISOString(), zillowAsOf: zillow.zillowAsOf,
    landConfigured: dmConfigured(), landDone, counties: scored,
  };
  await writeScan(store);
  return NextResponse.json({ ok: true, cached: false, refreshed: true, landEnrichedThisRun: landDone, ...store });
}
