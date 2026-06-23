import Link from "next/link";
import { saveMarketingNotes } from "@/app/actions";
import { getCurrentUser, isManager, canAccessMarketing } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import MarketsMap, { type Buyer, type Market } from "@/components/MarketsMap";
import VettingTable, { type Prospect } from "@/components/VettingTable";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";

// Same row shape the Buyer Research spreadsheet uses — both pages share one table.
function toProspect(r: Record<string, unknown>): Prospect {
  const s = (k: string) => String(r[k] ?? "");
  return {
    id: s("id"), name: s("name"), website: s("website"), email: s("email"), phone: s("phone"), phone2: s("phone2"),
    buyBoxAreas: s("buyBoxAreas"), outreachLog: s("outreachLog"), lastContacted: s("lastContacted"), nextFollowUp: s("nextFollowUp"),
    vetStage: s("vetStage"), vetStatus: s("vetStatus"), igHandle: s("igHandle"),
    category: s("category"), type: s("type"), title: s("title"), company: s("company"), preferredContact: s("preferredContact"),
    dealType: s("dealType"), buildType: s("buildType"), closingSpeed: s("closingSpeed"), priceRange: s("priceRange"), minLotSize: s("minLotSize"),
    propertyType: s("propertyType"), minBeds: s("minBeds"), maxBaths: s("maxBaths"), conditionTolerance: s("conditionTolerance"), needsView: s("needsView"),
    marketDetails: s("marketDetails"), decisionMaker: s("decisionMaker"), buyingFrequency: s("buyingFrequency"), bestContact: s("bestContact"),
  };
}


export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ saved?: string; imp?: string }> }) {
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
  void isManager;
  const sp = await searchParams;
  const [settings, rows, targets] = await Promise.all([
    getSettings(),
    db.marketContact.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    db.targetMarket.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const marketsForMap: Market[] = targets.map((t) => ({ id: t.id, name: t.name, tier: t.tier, score: t.score, lat: t.lat, lng: t.lng }));
  const TIER_PILL: Record<string, string> = { S: "bg-red-100 text-red-700", "1": "bg-orange-100 text-orange-700", "2": "bg-amber-100 text-amber-700", "3": "bg-sky-100 text-sky-700" };
  const buyers: Buyer[] = rows
    .filter((r) => r.vetStage === "vetted" || r.vetStage === "active")
    .map((r) => ({
      id: r.id, name: r.name, category: r.category, type: r.type, region: r.region, market: r.market,
      status: r.status, email: r.email, phone: r.phone, website: r.website, buyBox: r.buyBox,
      buyBoxAreas: r.buyBoxAreas, lat: r.lat, lng: r.lng, notes: r.notes,
    }));
  // Vetted Buyers shows ONLY vetted/active buyers — same spreadsheet table as Buyer
  // Research, grouped by type so it reads consistently across both pages.
  const VETTED = (r: { vetStage: string }) => r.vetStage === "vetted" || r.vetStage === "active";
  const vettedRows = rows.filter(VETTED);
  const isDevRow = (r: { category: string; type: string }) => r.category === "luxury" || r.type === "developer";
  const devs = vettedRows.filter(isDevRow).map(toProspect);
  const flips = vettedRows.filter((r) => !isDevRow(r)).map(toProspect);
  const buyerGroups = [
    { area: "🏗 Developers", prospects: devs },
    { area: "🔨 Fix & Flippers", prospects: flips },
  ].filter((g) => g.prospects.length > 0);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date());
  const markets = settings.marketingMarkets.split("\n").map((m) => m.trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      <SectionTitle title="🏛 Vetted Buyers" subtitle="Our vetted buyers & developers and their buy boxes — search a market to see exactly who'd want the deal. Sourcing new buyers? Start in Buyer Research." accent="bg-brand-gold"
        right={<Link href="/vetting" className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700">🔎 Buyer Research</Link>} />
      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}
      {sp.imp && /^\d+$/.test(sp.imp) && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Imported {sp.imp} contact{sp.imp === "1" ? "" : "s"}.</div>}
      {sp.imp === "empty" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Choose a CSV file or paste rows first.</div>}
      {sp.imp === "noname" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Your CSV needs a header row with a &ldquo;name&rdquo; column.</div>}

      {/* The interactive map + searchable rolodex */}
      <Card className="p-4">
        <MarketsMap buyers={buyers} markets={marketsForMap} />
      </Card>

      {/* Target markets — detail by county + neighborhoods */}
      {targets.length > 0 && (
        <div>
          <SectionTitle title="🎯 Target Markets" subtitle="Heat-tiered by sold $2M+ volume — top zips, neighborhoods, and the developers who buy there." accent="bg-red-400" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {targets.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-slate-800">{t.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TIER_PILL[t.tier] ?? "bg-slate-100 text-slate-600"}`}>Tier {t.tier}</span>
                  <span className="ml-auto text-sm font-bold tabular-nums text-slate-700">{t.score.toLocaleString()} <span className="text-xs font-normal text-slate-400">sold</span></span>
                </div>
                {t.summary && <p className="mt-1 text-xs text-slate-500">{t.summary}</p>}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-brand-navy">Top zips &amp; neighborhoods</summary>
                  <ul className="mt-1 space-y-0.5">{t.neighborhoods.split("\n").filter(Boolean).map((n, i) => <li key={i} className="text-xs text-slate-600">📍 {n}</li>)}</ul>
                </details>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[11px] font-semibold text-brand-navy">Developers &amp; buy boxes</summary>
                  <ul className="mt-1 space-y-0.5">{t.developers.split("\n").filter(Boolean).map((d, i) => <li key={i} className="text-xs text-slate-600">🏗 {d}</li>)}</ul>
                </details>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Markets + research */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">🗺 Markets we&apos;re in &amp; research</h3>
        {markets.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5">{markets.map((m, i) => <span key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{m}</span>)}</div>}
        {settings.marketingResearch && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-600">{settings.marketingResearch}</p>}
        <details>
          <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-brand-navy">Edit markets &amp; research</summary>
          <form action={saveMarketingNotes} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label><span className={labelCls}>Markets we&apos;re in (one per line)</span><textarea name="marketingMarkets" defaultValue={settings.marketingMarkets} rows={4} className={inputCls} /></label>
            <label><span className={labelCls}>Research notes</span><textarea name="marketingResearch" defaultValue={settings.marketingResearch} rows={4} className={inputCls} /></label>
            <div className="sm:col-span-2"><button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save</button></div>
          </form>
        </details>
      </Card>

      {/* Vetted buyers — same spreadsheet view as Buyer Research, grouped by type.
          New buyers start in Buyer Research and graduate here once vetted. */}
      <Card className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-emerald-300 bg-emerald-50/40 p-3">
        <span className="text-xs text-slate-600">{devs.length + flips.length} vetted {devs.length + flips.length === 1 ? "buyer" : "buyers"}. Click any cell to edit · ⊕ opens the buy box · set Status back to a working stage to send one to Buyer Research.</span>
        <Link href="/vetting" className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">🔎 Go to Buyer Research</Link>
      </Card>
      {buyerGroups.length === 0
        ? <Card className="p-6 text-center text-sm text-slate-400">No vetted buyers yet — vet developers in Buyer Research and they&apos;ll show here.</Card>
        : <VettingTable areas={buyerGroups} canEdit={canAccessMarketing(me)} today={today} allowAdd={false} />}

    </div>
  );
}
