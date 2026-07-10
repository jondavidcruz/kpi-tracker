import Link from "next/link";
import { saveMarketingNotes, saveTargetMarket, deleteTargetMarket, saveJvPartner, deleteJvPartner } from "@/app/actions";
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
    id: s("id"), name: s("name"), website: s("website"), links: s("links"), email: s("email"), phone: s("phone"), phone2: s("phone2"),
    buyBoxAreas: s("buyBoxAreas"), outreachLog: s("outreachLog"), lastContacted: s("lastContacted"), nextFollowUp: s("nextFollowUp"),
    vetStage: s("vetStage"), vetStatus: s("vetStatus"), igHandle: s("igHandle"),
    category: s("category"), type: s("type"), title: s("title"), company: s("company"), preferredContact: s("preferredContact"),
    dealType: s("dealType"), buildType: s("buildType"), closingSpeed: s("closingSpeed"), priceRange: s("priceRange"), minLotSize: s("minLotSize"),
    propertyType: s("propertyType"), minBeds: s("minBeds"), maxBaths: s("maxBaths"), conditionTolerance: s("conditionTolerance"), needsView: s("needsView"),
    marketDetails: s("marketDetails"), decisionMaker: s("decisionMaker"), buyingFrequency: s("buyingFrequency"), bestContact: s("bestContact"), companySize: s("companySize"),
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
  // JV partners are NOT our buyers — they're separate. Keep them out of every buyer view.
  const isJv = (r: { type: string }) => r.type === "jv_partner";
  const buyers: Buyer[] = rows
    .filter((r) => (r.vetStage === "vetted" || r.vetStage === "active") && !isJv(r))
    .map((r) => ({
      id: r.id, name: r.name, category: r.category, type: r.type, region: r.region, market: r.market,
      status: r.status, email: r.email, phone: r.phone, website: r.website, buyBox: r.buyBox,
      buyBoxAreas: r.buyBoxAreas, lat: r.lat, lng: r.lng, notes: r.notes,
    }));
  // Vetted Buyers shows ONLY vetted/active buyers — same spreadsheet table as Buyer
  // Research, grouped by type so it reads consistently across both pages.
  const VETTED = (r: { vetStage: string }) => r.vetStage === "vetted" || r.vetStage === "active";
  const vettedRows = rows.filter((r) => VETTED(r) && !isJv(r));
  // JV partners — kept completely separate from our vetted buyers/developers.
  const jvPartners = rows.filter(isJv).sort((a, b) => a.name.localeCompare(b.name));
  const isDevRow = (r: { category: string; type: string }) => r.category === "luxury" || r.type === "developer";
  const devs = vettedRows.filter(isDevRow).map(toProspect);
  const flips = vettedRows.filter((r) => !isDevRow(r)).map(toProspect);
  const buyerGroups = [
    { area: "🏗 Developers", prospects: devs },
    { area: "🔨 Fix & Flippers", prospects: flips },
  ].filter((g) => g.prospects.length > 0);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date());
  const markets = settings.marketingMarkets.split("\n").map((m) => m.trim()).filter(Boolean);

  // "Going cold" — vetted/active buyers we haven't touched in 30+ days, so relationships
  // don't rot. Days computed from lastContacted (blank = never contacted since vetting).
  const daysSince = (d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const ms = Date.parse(today) - Date.parse(d);
    return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : null;
  };
  const cold = vettedRows
    .map((r) => ({ id: r.id, name: r.name, days: daysSince(r.lastContacted), last: r.lastContacted, next: r.nextFollowUp }))
    .filter((r) => r.days === null || r.days >= 30)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999))
    .slice(0, 24);

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

      {/* Target markets — detail by county + neighborhoods (editable) */}
      <div>
        <SectionTitle title="🎯 Target Markets & Neighborhoods" subtitle="The areas we're farming — top zips, neighborhoods, and the developers who buy there. Add the neighborhoods you're pulling leads in." accent="bg-red-400" />
        {targets.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {targets.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-slate-800">{t.name}</span>
                  {t.tier && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TIER_PILL[t.tier] ?? "bg-slate-100 text-slate-600"}`}>Tier {t.tier}</span>}
                  {t.score > 0 && <span className="ml-auto text-sm font-bold tabular-nums text-slate-700">{t.score.toLocaleString()} <span className="text-xs font-normal text-slate-400">sold</span></span>}
                </div>
                {t.summary && <p className="mt-1 text-xs text-slate-500">{t.summary}</p>}
                {t.neighborhoods && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-brand-navy">Top zips &amp; neighborhoods</summary>
                    <ul className="mt-1 space-y-0.5">{t.neighborhoods.split("\n").filter(Boolean).map((n, i) => <li key={i} className="text-xs text-slate-600">📍 {n}</li>)}</ul>
                  </details>
                )}
                {t.developers && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[11px] font-semibold text-brand-navy">Developers &amp; buy boxes</summary>
                    <ul className="mt-1 space-y-0.5">{t.developers.split("\n").filter(Boolean).map((d, i) => <li key={i} className="text-xs text-slate-600">🏗 {d}</li>)}</ul>
                  </details>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-brand-navy">✎ Edit</summary>
                  <form action={saveTargetMarket} className="mt-2 space-y-1.5">
                    <input type="hidden" name="id" value={t.id} />
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <input name="name" defaultValue={t.name} placeholder="Name" className={inputCls} required />
                      <input name="region" defaultValue={t.region} placeholder="Region" className={inputCls} />
                      <input name="tier" defaultValue={t.tier} placeholder="Tier (S/1/2/3)" className={inputCls} />
                      <input name="score" type="number" defaultValue={t.score || ""} placeholder="Heat score" className={inputCls} />
                    </div>
                    <input name="summary" defaultValue={t.summary} placeholder="Summary" className={inputCls} />
                    <textarea name="neighborhoods" defaultValue={t.neighborhoods} rows={3} placeholder="Zips & neighborhoods — one per line" className={inputCls} />
                    <textarea name="developers" defaultValue={t.developers} rows={2} placeholder="Developers & buy boxes — one per line" className={inputCls} />
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Save</button>
                      <button formAction={deleteTargetMarket} className="text-xs font-medium text-slate-400 hover:text-red-600">Delete</button>
                    </div>
                  </form>
                </details>
              </Card>
            ))}
          </div>
        )}
        <Card className="mt-3 p-4">
          <details>
            <summary className="cursor-pointer text-sm font-bold text-slate-700">+ Add a target market / neighborhood</summary>
            <form action={saveTargetMarket} className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label><span className={labelCls}>Name *</span><input name="name" placeholder="Bird Rock – La Jolla" className={inputCls} required /></label>
                <label><span className={labelCls}>Region</span><input name="region" placeholder="SD / OC / LA" className={inputCls} /></label>
                <label><span className={labelCls}>Tier</span><input name="tier" placeholder="S / 1 / 2 / 3" className={inputCls} /></label>
                <label><span className={labelCls}>Heat score</span><input name="score" type="number" placeholder="sold $ volume" className={inputCls} /></label>
              </div>
              <label className="block"><span className={labelCls}>Summary</span><input name="summary" placeholder="Why we're targeting it / list criteria (SFR, built <1990, 40%+ equity…)" className={inputCls} /></label>
              <label className="block"><span className={labelCls}>Zips &amp; neighborhoods (one per line)</span><textarea name="neighborhoods" rows={3} placeholder={"92037 – La Jolla\n92109 – Pacific Beach"} className={inputCls} /></label>
              <label className="block"><span className={labelCls}>Developers &amp; buy boxes (one per line)</span><textarea name="developers" rows={2} placeholder="Builder name — buy box notes" className={inputCls} /></label>
              <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Add target market</button>
            </form>
          </details>
        </Card>
      </div>

      {/* Buyers going cold — vetted buyers not touched in 30+ days */}
      {cold.length > 0 && (
        <Card className="p-4">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-700">🧊 Buyers going cold</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{cold.length} need a touch</span>
          </div>
          <p className="mb-2 text-xs text-slate-500">Vetted buyers we haven&apos;t contacted in 30+ days. Reach out to keep the relationship warm — log the touch in <Link href="/vetting" className="underline">Buyer Research</Link>.</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {cold.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs ring-1 ring-slate-200">
                <span className="flex-1 truncate font-semibold text-slate-700">{c.name}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${c.days === null ? "bg-slate-200 text-slate-600" : c.days >= 60 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {c.days === null ? "never" : `${c.days}d`}
                </span>
              </div>
            ))}
          </div>
        </Card>
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

      {/* ───────── JV PARTNERS — deliberately separate from our vetted buyers ───────── */}
      <div className="mt-8 border-t-4 border-dashed border-indigo-200 pt-6">
        <SectionTitle title="🤝 JV Partners" subtitle="NOT our buyers or developers — partners who hold buy boxes we don't have. We send them a deal, they take it to their buyers, and we split 50/50." accent="bg-indigo-500" />
        <Card className="border-l-4 border-indigo-400 bg-indigo-50/50 p-4">
          <p className="text-sm text-indigo-900">
            <b>These are JV partners, not vetted end buyers.</b> Use them when a deal fits a developer buy box we can&apos;t reach directly.
            Send them the deal, they route it to their buyer, and we JV for a <b>50/50 split</b>. Keep them separate from the vetted-buyer list above —
            the deal is not going to a buyer we&apos;ve vetted, it&apos;s going through a partner.
          </p>
        </Card>

        {jvPartners.length > 0 && (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {jvPartners.map((p) => (
              <Card key={p.id} className="border-l-4 border-indigo-300 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-slate-800">{p.name}</span>
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">JV Partner · 50/50</span>
                  {p.company && <span className="text-xs text-slate-500">{p.company}</span>}
                  {(p.region || p.market) && <span className="ml-auto text-xs font-semibold text-slate-500">{[p.region, p.market].filter(Boolean).join(" · ")}</span>}
                </div>
                {(p.email || p.phone) && <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-600">{p.email && <span>✉️ {p.email}</span>}{p.phone && <span>📞 {p.phone}</span>}</div>}
                {p.buyBox && (
                  <div className="mt-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Buy boxes they can move</div>
                    <p className="whitespace-pre-wrap text-xs text-slate-700">{p.buyBox}</p>
                  </div>
                )}
                {p.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">📝 {p.notes}</p>}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-indigo-700">✎ Edit</summary>
                  <form action={saveJvPartner} className="mt-2 space-y-1.5">
                    <input type="hidden" name="id" value={p.id} />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input name="name" defaultValue={p.name} placeholder="Partner name *" className={inputCls} required />
                      <input name="company" defaultValue={p.company} placeholder="Company" className={inputCls} />
                      <input name="email" defaultValue={p.email} placeholder="Email" className={inputCls} />
                      <input name="phone" defaultValue={p.phone} placeholder="Phone" className={inputCls} />
                      <input name="region" defaultValue={p.region} placeholder="Region (SD/OC/LA)" className={inputCls} />
                      <input name="market" defaultValue={p.market} placeholder="Markets they cover" className={inputCls} />
                    </div>
                    <textarea name="buyBox" defaultValue={p.buyBox} rows={2} placeholder="Which developer buy boxes they can move — one per line" className={inputCls} />
                    <textarea name="notes" defaultValue={p.notes} rows={2} placeholder="JV terms, who they represent, notes" className={inputCls} />
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Save</button>
                      <button formAction={deleteJvPartner} className="text-xs font-medium text-slate-400 hover:text-red-600">Delete</button>
                    </div>
                  </form>
                </details>
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-3 p-4">
          <details>
            <summary className="cursor-pointer text-sm font-bold text-indigo-700">+ Add a JV partner</summary>
            <form action={saveJvPartner} className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <label><span className={labelCls}>Partner name *</span><input name="name" placeholder="Contact / company rep" className={inputCls} required /></label>
                <label><span className={labelCls}>Company</span><input name="company" placeholder="Their wholesaling co." className={inputCls} /></label>
                <label><span className={labelCls}>Region</span><input name="region" placeholder="SD / OC / LA" className={inputCls} /></label>
                <label><span className={labelCls}>Email</span><input name="email" placeholder="name@co.com" className={inputCls} /></label>
                <label><span className={labelCls}>Phone</span><input name="phone" placeholder="(xxx) xxx-xxxx" className={inputCls} /></label>
                <label><span className={labelCls}>Markets they cover</span><input name="market" placeholder="Cities / areas" className={inputCls} /></label>
              </div>
              <label className="block"><span className={labelCls}>Which developer buy boxes they can move (one per line)</span><textarea name="buyBox" rows={2} placeholder="e.g. Tear-down lots 92109 · luxury new-build to $3M · 5k+ sqft lots La Jolla" className={inputCls} /></label>
              <label className="block"><span className={labelCls}>JV terms / notes</span><textarea name="notes" rows={2} placeholder="50/50 split · who they represent · how fast they move" className={inputCls} /></label>
              <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Add JV partner</button>
            </form>
          </details>
        </Card>
      </div>

    </div>
  );
}
