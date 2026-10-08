import Link from "next/link";
import { getCurrentUser, canAccessMarketing } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import VettingTable, { type Prospect } from "@/components/VettingTable";
import CsvMapImport from "@/components/CsvMapImport";
import ArchivedBuyers from "@/components/ArchivedBuyers";
import { saveProspect } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function VettingPage({ searchParams }: { searchParams: Promise<{ imp?: string }> }) {
  const sp = await searchParams;
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
  const settings = await getSettings();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date());
  const weekAgo = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date(Date.now() - 7 * 86400000));

  // Every UNVETTED buyer lives here — the research pool. Vetted/active buyers
  // graduate to Markets / Vetted Buyers and drop off this page.
  const [rows, vettedCount, archivedRows] = await Promise.all([
    db.marketContact.findMany({
      where: { archivedAt: null, vetStage: { notIn: ["vetted", "active"] } },
      orderBy: [{ vetArea: "asc" }, { name: "asc" }],
      // speed (Sharyn 2026-10-08): MarketContact is ~55 columns; this page uses
      // ~35 — skipping notes/buyBox/contact/audit stamps cuts the payload hard
      // and keeps it flat as the pool grows.
      select: {
        id: true, name: true, website: true, links: true, email: true, phone: true, phone2: true,
        buyBoxAreas: true, outreachLog: true, lastContacted: true, nextFollowUp: true,
        vetStage: true, vetStatus: true, igHandle: true, touchOn: true, vetArea: true,
        category: true, type: true, title: true, company: true, preferredContact: true,
        dealType: true, buildType: true, closingSpeed: true, priceRange: true, minLotSize: true,
        propertyType: true, minBeds: true, maxBaths: true, conditionTolerance: true, needsView: true,
        marketDetails: true, decisionMaker: true, buyingFrequency: true, bestContact: true, companySize: true,
      },
    }),
    db.marketContact.count({ where: { archivedAt: null, vetStage: { in: ["vetted", "active"] }, type: { not: "jv_partner" } } }),
    db.marketContact.findMany({ where: { archivedAt: { not: null } }, orderBy: { archivedAt: "desc" }, take: 120, select: { id: true, name: true, archivedAt: true, archivedBy: true, archiveReason: true } }),
  ]);
  const UNASSIGNED = "Unassigned / general buyers";
  const toProspect = (r: typeof rows[number]): Prospect => ({
    id: r.id, name: r.name, website: r.website, links: r.links, email: r.email, phone: r.phone, phone2: r.phone2,
    buyBoxAreas: r.buyBoxAreas, outreachLog: r.outreachLog, lastContacted: r.lastContacted,
    nextFollowUp: r.nextFollowUp, vetStage: r.vetStage, vetStatus: r.vetStatus, igHandle: r.igHandle, touchOn: r.touchOn,
    category: r.category, type: r.type, title: r.title, company: r.company, preferredContact: r.preferredContact,
    dealType: r.dealType, buildType: r.buildType, closingSpeed: r.closingSpeed, priceRange: r.priceRange, minLotSize: r.minLotSize,
    propertyType: r.propertyType, minBeds: r.minBeds, maxBaths: r.maxBaths, conditionTolerance: r.conditionTolerance, needsView: r.needsView,
    marketDetails: r.marketDetails, decisionMaker: r.decisionMaker, buyingFrequency: r.buyingFrequency, bestContact: r.bestContact, companySize: r.companySize,
  });
  const areaMap = new Map<string, Prospect[]>();
  for (const r of rows) { const k = r.vetArea || UNASSIGNED; const a = areaMap.get(k) ?? []; a.push(toProspect(r)); areaMap.set(k, a); }
  // Keep the catch-all bucket last; sort the rest by size.
  const areas = Array.from(areaMap.entries()).map(([area, prospects]) => ({ area, prospects }))
    .sort((a, b) => (a.area === UNASSIGNED ? 1 : b.area === UNASSIGNED ? -1 : b.prospects.length - a.prospects.length));

  // Live research-credit check: what TODAY's work has stamped to this user, and
  // whether it actually reaches their dispo scorecard. rollupResearchKpis credits
  // ONLY position === "dispositions" — a mismatched Position fails silently (the
  // Sharyn 9/22 report), so this strip makes the gate visible to the rep.
  const myCredits = me
    ? await (async () => {
        // one parallel batch instead of 4 sequential round-trips (speed pass 2026-10-08)
        const [added, box, vetted, touched] = await Promise.all([
          db.marketContact.count({ where: { addedById: me.id, addedOn: today } }),
          db.marketContact.count({ where: { boxById: me.id, boxOn: today } }),
          db.marketContact.count({ where: { vettedById: me.id, vettedOn: today } }),
          db.marketContact.count({ where: { touchById: me.id, touchOn: today } }),
        ]);
        return { added, box, vetted, touched };
      })()
    : null;
  const creditsToScorecard = me?.position === "dispositions";

  // Follow-ups-due list REMOVED (Jon 2026-10-02 — the girls never used it;
  // outreach is driven by the vetting table + cold list on Vetted Buyers).
  const inPipeline = (s: string) => s === "to_vet" || s === "hold";
  const stats = {
    pipeline: rows.filter((r) => inPipeline(r.vetStage)).length,
    contacted7: rows.filter((r) => r.lastContacted && r.lastContacted >= weekAgo).length,
    vetted: vettedCount,
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="🔎 Buyer Research" subtitle="Every unvetted buyer / developer we're researching, by deal area. Work the lists, log touches, and graduate the good ones to Markets / Vetted Buyers. Better than the spreadsheet: search, sort, one-click status + follow-ups, wired to your KPIs." accent="bg-sky-400"
        right={<Link href="/marketing" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200">→ Vetted buyers</Link>} />

      {/* KPI tie-in */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-slate-800">{stats.pipeline}</div><div className="text-[11px] font-semibold text-slate-500">In pipeline</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-sky-700">{stats.contacted7}</div><div className="text-[11px] font-semibold text-slate-500">Contacted (7d) → 📇 Buyers Contacted</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-emerald-700">{stats.vetted}</div><div className="text-[11px] font-semibold text-slate-500">Vetted → ➕ New Buyers Added</div></Card>
      </div>

      {/* Your credited work today — instant feedback that the KPI pipeline is catching it */}
      {myCredits && (
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-2.5 text-sm ring-1 ${creditsToScorecard ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-300"}`}>
          <span className="font-bold">📊 Credited to you today:</span>
          <span>➕ {myCredits.added} added</span>
          <span>📦 {myCredits.box} buy-boxes</span>
          <span>✓ {myCredits.vetted} vetted</span>
          <span>📞 {myCredits.touched} contacted</span>
          {creditsToScorecard
            ? <span className="text-[12px] font-semibold">→ auto-logged to your Dispositions scorecard</span>
            : <span className="text-[12px] font-semibold">⚠️ NOT reaching a scorecard — your Position isn&apos;t set to Dispositions (Admin → People). Tell Jon.</span>}
        </div>
      )}

      {sp.imp && /^\d+$/.test(sp.imp) && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Imported {sp.imp} buyer{sp.imp === "1" ? "" : "s"} into the research pool.</div>}
      {sp.imp === "empty" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Choose a CSV file or paste rows first.</div>}
      {sp.imp === "noname" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Map the Name column before importing.</div>}

      {/* CSV import with column mapping */}
      <details className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">📥 Import buyers/developers from a CSV <span className="font-normal text-slate-400">— map your columns, no fixed template</span></summary>
        <p className="mt-2 mb-3 text-xs text-slate-500">Upload or paste any CSV. We&apos;ll auto-guess the columns; you pick which heading maps to each field, preview it, then import. New buyers land in the research pool as &quot;to contact.&quot;</p>
        <CsvMapImport />
      </details>

      <VettingTable areas={areas} canEdit={canAccessMarketing(me)} today={today} />

      <ArchivedBuyers rows={archivedRows} />

      {/* Start a new deal/area */}
      <Card className="border-l-4 border-emerald-300 bg-emerald-50/40 p-4">
        <h3 className="mb-1 text-sm font-bold text-slate-700">➕ Start a new deal / area</h3>
        <p className="mb-2 text-xs text-slate-500">Open a new list when we get an opportunity in a new area — then add the developers you find there.</p>
        <form action={saveProspect} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input name="vetArea" placeholder="Deal / area (e.g. 123 Main St, Joshua Tree) *" className="rounded border border-slate-300 px-2 py-1.5 text-xs sm:col-span-2" required />
          <input name="name" placeholder="First developer name *" className="rounded border border-slate-300 px-2 py-1.5 text-xs" required />
          <input name="phone" placeholder="Phone" className="rounded border border-slate-300 px-2 py-1.5 text-xs" />
          <input name="email" placeholder="Email" className="rounded border border-slate-300 px-2 py-1.5 text-xs" />
          <input name="website" placeholder="Website" className="rounded border border-slate-300 px-2 py-1.5 text-xs" />
          <input name="buyBoxAreas" placeholder="Buying area" className="rounded border border-slate-300 px-2 py-1.5 text-xs" />
          <div><button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Create area</button></div>
        </form>
      </Card>
    </div>
  );
}
