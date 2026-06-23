import Link from "next/link";
import { saveMarketContact, deleteMarketContact, saveMarketingNotes, importMarketContacts } from "@/app/actions";
import { getCurrentUser, isManager, canAccessMarketing } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import MarketsMap, { type Buyer, type Market } from "@/components/MarketsMap";
import CopyButton from "@/components/CopyButton";
import MarketContactForm from "@/components/MarketContactForm";
import MarketRolodexFilter from "@/components/MarketRolodexFilter";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";

const TYPES = ["developer", "custom", "remodeler", "flipper", "cash_buyer", "investor", "agent", "other"];
const REGIONS = [["SD", "San Diego Co."], ["OC", "Orange Co."], ["LA", "Los Angeles"], ["other", "Other / TBD"]];

type MC = Buyer & {
  sortOrder: number; vetStage: string; vetArea: string; igHandle: string; bestContact: string; lastContacted: string; nextFollowUp: string; outreachLog: string;
  company: string; title: string; preferredContact: string; decisionMaker: string; buyingFrequency: string; priceRange: string; closingSpeed: string;
  dealType: string; buildType: string; minLotSize: string;
  marketDetails: string; minBeds: string; maxBaths: string; propertyType: string; conditionTolerance: string; needsView: string;
};

function Rolodex({ items }: { items: MC[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.length === 0 && <Card className="p-6 text-center text-sm text-slate-400 lg:col-span-2">None yet.</Card>}
      {items.map((c) => {
        const stage = c.vetStage || "to_vet";
        const stageMeta: Record<string, { label: string; cls: string }> = {
          to_vet: { label: "To vet", cls: "bg-slate-200 text-slate-600" },
          vetted: { label: "Vetted", cls: "bg-sky-100 text-sky-700" },
          active: { label: "Active", cls: "bg-emerald-100 text-emerald-700" },
          hold: { label: "On hold", cls: "bg-amber-100 text-amber-700" },
          dead: { label: "Dead", cls: "bg-red-100 text-red-700" },
        };
        const sm = stageMeta[stage] ?? stageMeta.to_vet;
        const hay = [c.name, c.company, c.market, c.buyBoxAreas, c.priceRange, c.dealType, c.buildType, c.propertyType, c.status, c.email, c.phone, c.igHandle].filter(Boolean).join(" ").toLowerCase();
        return (
        <div key={c.id} data-mc-card data-search={hay} data-stage={stage}>
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-800">{c.name}</span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${sm.cls}`}>{sm.label}</span>
            {c.status && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{c.status}</span>}
            {c.market && <span className="ml-auto text-xs text-slate-400">📍 {c.market}</span>}
          </div>
          {(c.phone || c.email || c.igHandle) && <p className="mt-1 text-xs text-brand-navy">{[c.phone, c.email, c.igHandle].filter(Boolean).join(" · ")}</p>}
          {c.website && <a href={`https://${c.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:underline">{c.website} ↗</a>}
          {(c.company || c.title) && <p className="text-[11px] text-slate-500">{[c.company, c.title].filter(Boolean).join(" · ")}</p>}
          {c.buyBoxAreas && <p className="text-xs text-emerald-700">🎯 {c.buyBoxAreas}</p>}
          {(() => {
            const box = c.category === "luxury"
              ? [c.dealType, c.buildType, c.minLotSize && `lot ${c.minLotSize}`, c.priceRange]
              : [c.propertyType, c.minBeds && `${c.minBeds}+ bd`, c.maxBaths && `${c.maxBaths} ba`, c.conditionTolerance, c.priceRange];
            const extra = [c.closingSpeed, c.buyingFrequency, c.needsView, c.decisionMaker, c.preferredContact && `via ${c.preferredContact}`];
            const all = [...box, ...extra].filter(Boolean);
            return all.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {all.map((x, i) => <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{x}</span>)}
              </div>
            ) : null;
          })()}
          {c.buyBox && <p className="text-xs text-slate-600">{c.buyBox}</p>}
          {c.bestContact && <p className="text-xs text-violet-700">📣 Reach: {c.bestContact}</p>}
          {c.lastContacted && <p className="text-[11px] text-slate-400">Last contacted {c.lastContacted}</p>}
          {c.outreachLog && <p className="mt-0.5 rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">📋 {c.outreachLog}</p>}
          {c.notes && <p className="mt-0.5 text-xs italic text-slate-500">{c.notes}</p>}
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-brand-navy">Edit / delete</summary>
            <div className="mt-2"><MarketContactForm c={c} /></div>
            <form action={deleteMarketContact} className="mt-1"><input type="hidden" name="id" value={c.id} /><button className="text-[11px] font-medium text-slate-300 hover:text-red-600">Delete</button></form>
          </details>
        </Card>
        </div>
        );
      })}
    </div>
  );
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
  // Markets & Buyers shows ONLY vetted/active buyers. Everyone else is in the
  // Buyer Vetting pipeline below (unvetted) or archived (not interested).
  const VETTED = (r: { vetStage: string }) => r.vetStage === "vetted" || r.vetStage === "active";
  const vettedRows = rows.filter(VETTED);
  const luxury = vettedRows.filter((r) => r.category === "luxury") as MC[];
  const distressed = vettedRows.filter((r) => r.category !== "luxury") as MC[];
  const markets = settings.marketingMarkets.split("\n").map((m) => m.trim()).filter(Boolean);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date());

  const dueRows = (rows as MC[]).filter((r) => r.nextFollowUp && r.nextFollowUp <= today).sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));

  return (
    <div className="space-y-6">
      <SectionTitle title="🗺 Markets & Buyers" subtitle="Interactive map of our target markets and the developers + flippers who buy there. Search an area to see who matches." accent="bg-brand-gold" />
      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}
      {sp.imp && /^\d+$/.test(sp.imp) && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Imported {sp.imp} contact{sp.imp === "1" ? "" : "s"}.</div>}
      {sp.imp === "empty" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Choose a CSV file or paste rows first.</div>}
      {sp.imp === "noname" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Your CSV needs a header row with a &ldquo;name&rdquo; column.</div>}

      {/* Follow-ups due — the daily driver */}
      {dueRows.length > 0 && (
        <Card className="border-l-4 border-red-400 bg-red-50/50 p-4">
          <h3 className="mb-2 text-sm font-bold text-red-800">⏰ Follow-ups due ({dueRows.length}) — reach out today</h3>
          <div className="space-y-1.5">
            {dueRows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-800">{r.name}</span>
                {r.market && <span className="text-xs text-slate-400">📍 {r.market}</span>}
                {r.bestContact && <span className="text-xs text-violet-700">📣 {r.bestContact}</span>}
                {[r.phone, r.email, r.igHandle].filter(Boolean).length > 0 && <span className="text-xs text-brand-navy">{[r.phone, r.email, r.igHandle].filter(Boolean).join(" · ")}</span>}
                <span className={`ml-auto text-[11px] font-semibold ${r.nextFollowUp < today ? "text-red-600" : "text-amber-600"}`}>{r.nextFollowUp < today ? "overdue" : "today"} · {r.nextFollowUp}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

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
            <label className="sm:col-span-2"><span className={labelCls}>Outreach templates (openers, leverage, sequence)</span><textarea name="outreachTemplates" defaultValue={settings.outreachTemplates} rows={8} className={inputCls} /></label>
            <div className="sm:col-span-2"><button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save</button></div>
          </form>
        </details>
      </Card>

      {/* Outreach templates — copy-paste playbook */}
      {settings.outreachTemplates && (
        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-700">📣 Outreach templates &amp; playbook</h3>
            <span className="ml-auto"><CopyButton text={settings.outreachTemplates} label="Copy all" /></span>
          </div>
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">{settings.outreachTemplates}</pre>
        </Card>
      )}

      {/* CSV bulk import — for the dispo team to add vetted developers/flippers fast */}
      <Card className="border-l-4 border-emerald-300 bg-emerald-50/40 p-5">
        <h3 className="mb-1 text-sm font-bold text-slate-700">⬆️ Bulk import (CSV)</h3>
        <p className="mb-2 text-xs text-slate-500">Add many vetted developers / flippers at once. Header row columns (any subset): <span className="font-mono">name, category (luxury|distressed), company, title, market, status, vetStage, email, phone, website, preferredContact, decisionMaker, buyingFrequency, priceRange, closingSpeed, dealType, buildType, minLotSize, propertyType, minBeds, maxBaths, conditionTolerance, needsView, buyBoxAreas (target geography / preferred markets), marketDetails, igHandle, bestContact, lat, lng, notes</span>. Only <strong>name</strong> is required.</p>
        <form action={importMarketContacts} className="grid grid-cols-1 gap-2">
          <input type="file" name="file" accept=".csv,text/csv" className="text-xs text-slate-600" />
          <textarea name="csv" rows={3} placeholder="…or paste CSV here (first row = headers)" className={inputCls} />
          <div><button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Import rows</button></div>
        </form>
      </Card>

      {/* Rolodex by category — VETTED buyers only */}
      <MarketRolodexFilter />
      <div>
        <SectionTitle title="🏛 Luxury / Developers" subtitle={`${luxury.length} vetted developers & luxury buyers`} accent="bg-brand-navy" />
        <Rolodex items={luxury} />
        <Card className="mt-3 p-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add a luxury buyer / developer</h4><MarketContactForm defaultCategory="luxury" /></Card>
      </div>
      <div>
        <SectionTitle title="🔨 Distressed / Flippers" subtitle={`${distressed.length} vetted flippers & cash buyers`} accent="bg-amber-400" />
        <Rolodex items={distressed} />
        <Card className="mt-3 p-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add a flipper / cash buyer</h4><MarketContactForm defaultCategory="distressed" /></Card>
      </div>

      {/* Buyer Vetting moved to its own page → /vetting */}
      <Card className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-sky-300 bg-sky-50/40 p-4">
        <div>
          <h3 className="text-sm font-bold text-slate-700">🔎 Looking for new developers?</h3>
          <p className="text-xs text-slate-500">The outbound pipeline (unvetted developers we&apos;re sourcing per deal/area) lives on its own page now.</p>
        </div>
        <Link href="/vetting" className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700">Open Buyer Vetting →</Link>
      </Card>
    </div>
  );
}
