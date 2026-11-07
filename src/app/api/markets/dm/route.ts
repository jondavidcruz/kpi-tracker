import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { dmPing, dmLocationSearch, dmCount, dmMarketInventory, dmMotivationByMarket, buildLandFilters, type DmLoc, type DmFilter, type LandFilterInput } from "@/lib/dealmachine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 🏕 DealMachine research endpoint (manager-only). Counts are FREE — no credits spent.
//   GET  ?action=ping                 → verify the v2 key works
//   GET  ?action=locations&q=Lee...   → resolve a county/city/zip to its code
//   POST { locations, filters }       → free property count for an area + land filters
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "ping";
  if (action === "ping") return NextResponse.json(await dmPing());
  if (action === "inventory") return NextResponse.json(await dmMarketInventory());
  if (action === "motivation") {
    // 🎯 Motivated-owner density per market (free). Cached in __market_motivation__ (7-day TTL)
    // since it's 4 counts × every county; ?refresh=1 recomputes.
    const CAT = "__market_motivation__";
    const fresh = url.searchParams.get("refresh") === "1";
    if (!fresh) {
      const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
      if (row?.description) {
        try {
          const s = JSON.parse(row.description) as { asOf: string; markets: unknown[] };
          if (s.asOf && Date.now() - new Date(s.asOf).getTime() < 7 * 86400_000) return NextResponse.json({ ok: true, cached: true, ...s });
        } catch { /* recompute */ }
      }
    }
    const r = await dmMotivationByMarket();
    if (!r.ok) return NextResponse.json(r);
    const store = { asOf: new Date().toISOString(), markets: r.markets };
    const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
    const description = JSON.stringify(store);
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } }).catch(() => {});
    else await db.resource.create({ data: { title: "market-motivation", category: CAT, url: "", description } }).catch(() => {});
    return NextResponse.json({ ok: true, cached: false, ...store });
  }
  if (action === "pulls") {
    const row = await db.resource.findFirst({ where: { category: "__dm_pulls__" } }).catch(() => null);
    let log: { at: string; by: string; area: string; credits: number; pulled: number }[] = [];
    try { log = (JSON.parse(row?.description || "[]") as { at: string; by: string; area: string; credits: number; pulled: number; leads?: unknown }[]).map((p) => ({ at: p.at, by: p.by, area: p.area, credits: p.credits, pulled: p.pulled })); } catch { /* */ }
    const creditsThisMonth = log.filter((p) => p.at.slice(0, 7) === new Date().toISOString().slice(0, 7)).reduce((s, p) => s + (p.credits || 0), 0);
    return NextResponse.json({ pulls: log.slice(0, 15), creditsThisMonth });
  }
  if (action === "locations") {
    const q = url.searchParams.get("q") ?? "";
    const type = (url.searchParams.get("type") ?? undefined) as "county" | "city" | "zip_code" | "state" | undefined;
    if (!q.trim()) return NextResponse.json({ data: [] });
    return NextResponse.json({ data: await dmLocationSearch(q, type) });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { locations?: DmLoc[]; filters?: DmFilter[]; land?: LandFilterInput };
  if (!body.locations?.length) return NextResponse.json({ error: "pick an area first" }, { status: 400 });
  const filters = body.land ? buildLandFilters(body.land) : (body.filters ?? []);
  const r = await dmCount(body.locations, filters);
  if (!r.ok) return NextResponse.json({ error: r.error, status: r.status }, { status: 502 });
  return NextResponse.json({ ok: true, count: r.count });
}
