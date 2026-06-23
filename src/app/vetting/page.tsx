import Link from "next/link";
import { getCurrentUser, canAccessMarketing } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import VettingTable, { type Prospect } from "@/components/VettingTable";
import { saveProspect } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function VettingPage() {
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

  // Everything we're sourcing by deal/area lives here (vetArea set).
  const rows = await db.marketContact.findMany({
    where: { vetArea: { not: "" } },
    orderBy: [{ vetArea: "asc" }, { name: "asc" }],
  });
  const toProspect = (r: typeof rows[number]): Prospect => ({
    id: r.id, name: r.name, website: r.website, email: r.email, phone: r.phone,
    buyBoxAreas: r.buyBoxAreas, outreachLog: r.outreachLog, lastContacted: r.lastContacted,
    nextFollowUp: r.nextFollowUp, vetStage: r.vetStage, vetStatus: r.vetStatus, igHandle: r.igHandle,
  });
  const areaMap = new Map<string, Prospect[]>();
  for (const r of rows) { const a = areaMap.get(r.vetArea) ?? []; a.push(toProspect(r)); areaMap.set(r.vetArea, a); }
  const areas = Array.from(areaMap.entries()).map(([area, prospects]) => ({ area, prospects }))
    .sort((a, b) => b.prospects.length - a.prospects.length);

  const inPipeline = (s: string) => s === "to_vet" || s === "hold";
  const stats = {
    pipeline: rows.filter((r) => inPipeline(r.vetStage)).length,
    contacted7: rows.filter((r) => r.lastContacted && r.lastContacted >= weekAgo).length,
    vetted: rows.filter((r) => r.vetStage === "vetted" || r.vetStage === "active").length,
    dueToday: rows.filter((r) => r.nextFollowUp && r.nextFollowUp <= today && inPipeline(r.vetStage)).length,
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="🔎 Buyer Vetting" subtitle="Outbound pipeline — the developers we're sourcing in each deal's area before they're vetted. Better than the spreadsheet: search, sort, one-click status + follow-ups, wired to your KPIs." accent="bg-sky-400"
        right={<Link href="/marketing" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200">→ Vetted buyers</Link>} />

      {/* KPI tie-in */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-slate-800">{stats.pipeline}</div><div className="text-[11px] font-semibold text-slate-500">In pipeline</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-rose-600">{stats.dueToday}</div><div className="text-[11px] font-semibold text-slate-500">Follow-ups due</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-sky-700">{stats.contacted7}</div><div className="text-[11px] font-semibold text-slate-500">Contacted (7d) → 📇 Buyers Contacted</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-emerald-700">{stats.vetted}</div><div className="text-[11px] font-semibold text-slate-500">Vetted → ➕ New Buyers Added</div></Card>
      </div>

      <VettingTable areas={areas} canEdit={canAccessMarketing(me)} today={today} />

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
