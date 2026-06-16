import Link from "next/link";
import { saveMarketContact, deleteMarketContact, saveMarketingNotes } from "@/app/actions";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";

const TYPES = ["developer", "flipper", "cash_buyer", "investor", "agent", "other"];
const TYPE_LABEL: Record<string, string> = { developer: "Developer", flipper: "Flipper", cash_buyer: "Cash buyer", investor: "Investor", agent: "Agent", other: "Other" };

type MC = { id: string; name: string; category: string; type: string; market: string; contact: string; buyBox: string; notes: string; sortOrder: number };

function ContactForm({ c, defaultCategory }: { c?: MC; defaultCategory?: string }) {
  return (
    <form action={saveMarketContact} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {c && <input type="hidden" name="id" value={c.id} />}
      <label><span className={labelCls}>Name</span><input name="name" defaultValue={c?.name ?? ""} placeholder="Name / company" className={inputCls} required /></label>
      <label><span className={labelCls}>Category</span>
        <select name="category" defaultValue={c?.category ?? defaultCategory ?? "distressed"} className={inputCls}>
          <option value="luxury">Luxury / Developer</option>
          <option value="distressed">Distressed / Flipper</option>
        </select>
      </label>
      <label><span className={labelCls}>Type</span><select name="type" defaultValue={c?.type ?? ""} className={inputCls}><option value="">—</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
      <label><span className={labelCls}>Market(s)</span><input name="market" defaultValue={c?.market ?? ""} placeholder="San Diego, Phoenix…" className={inputCls} /></label>
      <label><span className={labelCls}>Contact</span><input name="contact" defaultValue={c?.contact ?? ""} placeholder="email / phone" className={inputCls} /></label>
      <label><span className={labelCls}>Sort</span><input name="sortOrder" type="number" defaultValue={c?.sortOrder ?? 0} className={inputCls} /></label>
      <label className="sm:col-span-3"><span className={labelCls}>Buy box / criteria</span><input name="buyBox" defaultValue={c?.buyBox ?? ""} placeholder="price range, condition, type they want" className={inputCls} /></label>
      <label className="sm:col-span-3"><span className={labelCls}>Notes</span><input name="notes" defaultValue={c?.notes ?? ""} className={inputCls} /></label>
      <div className="sm:col-span-3"><button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">{c ? "Save" : "Add"}</button></div>
    </form>
  );
}

function ContactCard({ c, canEdit }: { c: MC; canEdit: boolean }) {
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-slate-800">{c.name}</span>
        {c.type && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{TYPE_LABEL[c.type] ?? c.type}</span>}
        {c.market && <span className="text-xs text-slate-400">📍 {c.market}</span>}
      </div>
      {c.buyBox && <p className="mt-1 text-sm text-slate-600"><span className="text-slate-400">Buy box:</span> {c.buyBox}</p>}
      {c.contact && <p className="text-xs text-slate-500">{c.contact}</p>}
      {c.notes && <p className="mt-0.5 text-xs italic text-slate-500">{c.notes}</p>}
      {canEdit && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-brand-navy">Edit / delete</summary>
          <div className="mt-2"><ContactForm c={c} /></div>
          <form action={deleteMarketContact} className="mt-1"><input type="hidden" name="id" value={c.id} /><button className="text-[11px] font-medium text-slate-300 hover:text-red-600">Delete</button></form>
        </details>
      )}
    </Card>
  );
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const [settings, contacts] = await Promise.all([
    getSettings(),
    db.marketContact.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const luxury = contacts.filter((c) => c.category === "luxury") as MC[];
  const distressed = contacts.filter((c) => c.category !== "luxury") as MC[];
  const markets = settings.marketingMarkets.split("\n").map((m) => m.trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      <SectionTitle title="📣 Marketing" subtitle="Buyers, developers & flippers, our markets, and research — split by luxury vs distressed." accent="bg-brand-gold" />
      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}

      {/* Markets + research */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">🗺 Markets we&apos;re in &amp; research</h3>
        {markets.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5">{markets.map((m, i) => <span key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{m}</span>)}</div>}
        {settings.marketingResearch && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-600">{settings.marketingResearch}</p>}
        <details>
          <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-brand-navy">Edit markets &amp; research</summary>
          <form action={saveMarketingNotes} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label><span className={labelCls}>Markets we&apos;re in (one per line)</span><textarea name="marketingMarkets" defaultValue={settings.marketingMarkets} rows={4} placeholder={"San Diego\nPhoenix\nLas Vegas"} className={inputCls} /></label>
            <label><span className={labelCls}>Research notes</span><textarea name="marketingResearch" defaultValue={settings.marketingResearch} rows={4} className={inputCls} /></label>
            <div className="sm:col-span-2"><button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save</button></div>
          </form>
        </details>
      </Card>

      {/* Luxury / Developers */}
      <div>
        <SectionTitle title="🏛 Luxury / Developers" subtitle="Buyers and developers for luxury residential + garage-condo deals" accent="bg-brand-navy" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {luxury.length === 0 && <Card className="p-6 text-center text-sm text-slate-400 lg:col-span-2">None yet.</Card>}
          {luxury.map((c) => <ContactCard key={c.id} c={c} canEdit />)}
        </div>
        <Card className="mt-3 p-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add a luxury buyer / developer</h4><ContactForm defaultCategory="luxury" /></Card>
      </div>

      {/* Distressed / Flippers */}
      <div>
        <SectionTitle title="🔨 Distressed / Flippers" subtitle="Traditional cash buyers & flippers for wholesale deals" accent="bg-amber-400" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {distressed.length === 0 && <Card className="p-6 text-center text-sm text-slate-400 lg:col-span-2">None yet.</Card>}
          {distressed.map((c) => <ContactCard key={c.id} c={c} canEdit />)}
        </div>
        <Card className="mt-3 p-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add a flipper / cash buyer</h4><ContactForm defaultCategory="distressed" /></Card>
      </div>
    </div>
  );
}
