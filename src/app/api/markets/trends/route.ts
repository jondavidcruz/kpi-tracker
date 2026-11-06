import { NextResponse } from "next/server";
import { getCurrentUser, isManager, canAccessMarketing } from "@/lib/auth";
import { readMarketTrends, refreshMarketTrends } from "@/lib/market-trends";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the refresh fetches Zillow's 4.5MB metro file once

// 📈 Market price trends (free Zillow research data). GET = read the cached small result;
// POST = refresh it (manager; fetches the file, keeps only the trend). Infra-light.
export async function GET() {
  const me = await getCurrentUser();
  if (!me || !canAccessMarketing(me)) return NextResponse.json({ error: "no access" }, { status: 403 });
  return NextResponse.json({ ok: true, store: await readMarketTrends() });
}
export async function POST() {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const r = await refreshMarketTrends();
  return NextResponse.json(r.ok ? { ok: true, store: r.store } : { ok: false, error: r.error }, { status: r.ok ? 200 : 502 });
}
