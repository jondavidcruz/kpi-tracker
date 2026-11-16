import { NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { dmConfigured } from "@/lib/dealmachine";
import { readZipMarket, refreshZipMarket } from "@/lib/zip-market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 📍 Per-ZIP / per-city Buyer↔Seller land market index for the ZIPs we've PULLED.
//   GET            → the cached ZIP/city index
//   GET ?refresh=1 → recompute from free DealMachine counts (managers only; ~4 calls per pulled ZIP)
function secretOk(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

export async function GET(req: Request) {
  const me = await getCurrentUser();
  const isMgr = isManager(me);
  const cron = secretOk(req);
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";

  if (!refresh) {
    const cached = await readZipMarket();
    return NextResponse.json({ ok: true, cached: true, ...(cached ?? { asOf: "", configured: dmConfigured(), zips: [], cities: [] }) });
  }
  if (!isMgr && !cron) return NextResponse.json({ ok: false, error: "managers only" }, { status: 403 });
  const cap = Math.max(1, Math.min(120, Number(url.searchParams.get("cap")) || 60));
  try {
    const store = await refreshZipMarket({ cap });
    return NextResponse.json({ ok: true, refreshed: true, count: store.zips.length, cityCount: store.cities.length, ...store });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 140) }, { status: 502 });
  }
}
