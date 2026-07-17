import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, canAccessMarketing } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import MarketsMap, { type Buyer as MapBuyer, type Market } from "@/components/MarketsMap";
import { getBuyerDemand, areasOfBuyer, typeLabelOf } from "@/lib/buyer-report";

export const dynamic = "force-dynamic";

export default async function LeadSourcingPage() {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">No access</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const [demand, mapRows, targets] = await Promise.all([
    getBuyerDemand(),
    db.marketContact.findMany({
      where: { vetStage: { in: ["vetted", "active"] }, type: { not: "jv_partner" } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, type: true, region: true, market: true, status: true, email: true, phone: true, website: true, buyBox: true, buyBoxAreas: true, lat: true, lng: true, notes: true, contact: true },
    }),
    db.targetMarket.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const { buyers, ranked, newMarkets, typeMix } = demand;
  const mapBuyers: MapBuyer[] = mapRows.map((r) => ({
    id: r.id, name: r.name, category: r.category, type: r.type, region: r.region, market: r.market,
    status: r.status, email: r.email, phone: r.phone, website: r.website, buyBox: r.buyBox,
    buyBoxAreas: r.buyBoxAreas, lat: r.lat, lng: r.lng, notes: r.notes, buyBoxMapUrl: r.contact,
  }));
  const markets: Market[] = targets.map((t) => ({ id: t.id, name: t.name, tier: t.tier, score: t.score, lat: t.lat, lng: t.lng }));

  const maxCount = Math.max(1, ...ranked.map((r) => r.count));
  const topPicks = ranked.slice(0, 4);
  const withCoords = mapRows.filter((r) => r.lat != null && r.lng != null).length;

  return (
    <div className="space-y-5">
      <SectionTitle title="🗺️ Lead Sourcing — where to pull" subtitle={`Live, from ${buyers.length} vetted buyers' buy boxes${typeMix ? ` (${typeMix})` : ""}. Ranked by how many buyers want deals in each area. Green = you already farm it · amber = NEW demand you're not pulling yet.`} accent="bg-brand-gold" />

      {/* Top-pick tiles */}
      {topPicks.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {topPicks.map((r) => (
            <div key={r.label} className={`rounded-2xl border p-4 text-center ${r.covered ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
              <div className={`text-4xl font-extrabold leading-none ${r.covered ? "text-emerald-700" : "text-amber-700"}`}>{r.count}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">buyers want</div>
              <div className="mt-1 text-sm font-extrabold text-slate-800">{r.label}</div>
              <div className={`mt-1 text-[10px] font-bold ${r.covered ? "text-emerald-600" : "text-amber-700"}`}>{r.covered ? "✅ already farming" : "🆕 NEW — pull here"}</div>
            </div>
          ))}
        </div>
      )}

      {/* Interactive map */}
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold text-slate-700">📍 Buyer map — click a pin to see who buys there</span>
          <Link href="/marketing" className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">Manage buyers</Link>
        </div>
        <MarketsMap buyers={mapBuyers} markets={markets} />
        {withCoords < mapRows.length && (
          <p className="mt-2 text-[11px] text-amber-600">⚠️ {mapRows.length - withCoords} of {mapRows.length} vetted buyers aren&apos;t on the map yet (no location saved). Add a city/lat-lng on the Vetted Buyers page so they pin here.</p>
        )}
      </Card>

      {/* Heat-bar demand ranking */}
      <Card className="p-4">
        <h3 className="mb-1 text-sm font-bold text-slate-700">📊 Every market, ranked by buyer demand</h3>
        <div className="mb-3 flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> already farming</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> NEW — buyer demand you&apos;re not pulling</span>
        </div>
        {ranked.length === 0 ? (
          <p className="text-sm text-slate-400">No target areas found in the buy boxes yet — add areas to each buyer on the Vetted Buyers page.</p>
        ) : (
          <div className="space-y-1.5">
            {ranked.map((r) => (
              <div key={r.label} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate text-[13px] font-semibold text-slate-700" title={r.label}>{r.label}{!r.covered && <span className="ml-1 rounded bg-amber-500 px-1 text-[9px] font-bold text-white">NEW</span>}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                  <div className={`h-5 rounded ${r.covered ? "bg-emerald-600" : "bg-amber-500"}`} style={{ width: `${Math.max(14, Math.round((r.count / maxCount) * 100))}%` }} />
                </div>
                <span className="w-6 shrink-0 text-right text-sm font-extrabold tabular-nums text-slate-800">{r.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* New markets callout */}
      {newMarkets.length > 0 ? (
        <Card className="border-l-4 border-amber-400 bg-amber-50/50 p-4">
          <div className="text-sm font-bold text-amber-800">🆕 New markets to add this weekend</div>
          <p className="mt-1 text-[13px] text-amber-800">You have buyers waiting in <b>{newMarkets.slice(0, 4).map((r) => r.label).join(", ")}</b>{newMarkets.length > 4 ? ` +${newMarkets.length - 4} more` : ""} but you&apos;re not pulling there yet. Start with <b>{newMarkets[0].label}</b> ({newMarkets[0].count} buyer{newMarkets[0].count === 1 ? "" : "s"} waiting).</p>
        </Card>
      ) : (
        <Card className="p-4 text-[13px] text-emerald-700">🎉 Every market your buyers want is already in your Target Markets — no new markets needed this weekend.</Card>
      )}

      {/* Developer buy-box cards */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-slate-700">🏗️ The exact buy boxes (vetted buyers)</h3>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {buyers.map((b, i) => {
            const areas = areasOfBuyer(b);
            const specs = [b.priceRange && `💰 ${b.priceRange}`, b.propertyType, b.buildType, b.dealType, b.minLotSize && `lot ${b.minLotSize}`].map((x) => (x || "").trim()).filter(Boolean);
            return (
              <Card key={`${b.name}-${i}`} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-extrabold text-slate-800">{b.name}</span>
                  <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700">{typeLabelOf(b.type)}</span>
                  {b.region && <span className="text-[11px] text-slate-400">{b.region}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {areas.length ? areas.map((a) => (
                    <span key={a} className="rounded-full bg-brand-navy px-2.5 py-0.5 text-[11px] font-semibold text-white">📍 {a}</span>
                  )) : <span className="rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700">⚠️ no target areas listed — add them so this buyer shows on the map</span>}
                </div>
                {specs.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {specs.map((s) => <span key={s} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{s}</span>)}
                  </div>
                )}
                {b.buyBox && <p className="mt-1.5 text-[11px] italic text-slate-400">“{b.buyBox.length > 180 ? b.buyBox.slice(0, 180) + "…" : b.buyBox}”</p>}
              </Card>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-slate-400">Vetted buyers only (JV partners excluded). This is the same data emailed to Jon every Friday at end of shift. Areas come straight from each buyer&apos;s target-areas field — tighten them on <Link href="/marketing" className="underline">Vetted Buyers</Link> to sharpen the map.</p>
    </div>
  );
}
