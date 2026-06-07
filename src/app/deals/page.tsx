import { archiveDeal, saveDeal } from "@/app/actions";
import { getActiveDeals } from "@/lib/data";
import { Card, SectionTitle } from "@/components/ui";
import type { Deal } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = [
  { key: "under_contract", label: "Under Contract", cls: "bg-sky-100 text-sky-800" },
  { key: "marketing", label: "Marketing", cls: "bg-amber-100 text-amber-800" },
  { key: "buyer_found", label: "Buyer Found", cls: "bg-violet-100 text-violet-800" },
  { key: "sold", label: "Sold", cls: "bg-emerald-100 text-emerald-800" },
  { key: "dead", label: "Dead", cls: "bg-slate-200 text-slate-600" },
];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";

function money(n: number | null): string {
  return n === null ? "—" : `$${n.toLocaleString()}`;
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const sp = await searchParams;
  const deals = await getActiveDeals();

  // Group by status for the pipeline view.
  const byStatus = STATUSES.map((s) => ({
    ...s,
    deals: deals.filter((d) => d.status === s.key),
  }));
  const openCount = deals.filter((d) => !["sold", "dead"].includes(d.status)).length;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="🤝 Deals Board"
        subtitle="Dispositions — active deals being pushed to sell. Add a deal, update status as it moves."
        accent="bg-brand-gold"
        right={<span className="text-sm font-semibold text-slate-500">{openCount} active</span>}
      />

      {sp.saved && (
        <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
          ✓ Saved.
        </div>
      )}

      {/* Pipeline summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {byStatus.map((s) => (
          <Card key={s.key} className="p-3 text-center">
            <div className={`mx-auto mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${s.cls}`}>
              {s.label}
            </div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-800">{s.deals.length}</div>
          </Card>
        ))}
      </div>

      {/* Add a deal */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">+ Add a deal</h3>
        <form action={saveDeal} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input name="address" placeholder="Property address *" className={`${inputCls} sm:col-span-2`} required />
          <select name="status" defaultValue="under_contract" className={inputCls}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select name="assignedTo" defaultValue="" className={inputCls}>
            <option value="">— assign to —</option>
            <option value="Sharyn">Sharyn</option>
            <option value="Marie">Marie</option>
          </select>
          <input name="contractPrice" placeholder="Contract $" className={inputCls} />
          <input name="askingPrice" placeholder="Asking $" className={inputCls} />
          <input name="buyerName" placeholder="Buyer (if found)" className={inputCls} />
          <input type="date" name="contractDate" className={inputCls} title="Contract date" />
          <input name="notes" placeholder="Notes" className={`${inputCls} sm:col-span-3`} />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Add deal
          </button>
        </form>
      </Card>

      {/* Deal rows (editable) */}
      <div className="space-y-3">
        {deals.length === 0 && (
          <Card className="p-10 text-center text-slate-400">No deals yet. Add your first one above.</Card>
        )}
        {deals.map((d) => (
          <DealRow key={d.id} deal={d} />
        ))}
      </div>
    </div>
  );
}

function DealRow({ deal }: { deal: Deal }) {
  const st = STATUSES.find((s) => s.key === deal.status) ?? STATUSES[0];
  return (
    <Card className="p-4">
      <form action={saveDeal} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="id" value={deal.id} />
        <div className="flex items-center gap-2 sm:col-span-2">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
          <input name="address" defaultValue={deal.address} className={inputCls} />
        </div>
        <select name="status" defaultValue={deal.status} className={inputCls}>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select name="assignedTo" defaultValue={deal.assignedTo} className={inputCls}>
          <option value="">— assign —</option>
          <option value="Sharyn">Sharyn</option>
          <option value="Marie">Marie</option>
        </select>
        <input name="contractPrice" defaultValue={deal.contractPrice ?? ""} placeholder="Contract $" className={inputCls} />
        <input name="askingPrice" defaultValue={deal.askingPrice ?? ""} placeholder="Asking $" className={inputCls} />
        <input name="soldPrice" defaultValue={deal.soldPrice ?? ""} placeholder="Sold $" className={inputCls} />
        <input name="buyerName" defaultValue={deal.buyerName} placeholder="Buyer" className={inputCls} />
        <input name="notes" defaultValue={deal.notes} placeholder="Notes" className={`${inputCls} sm:col-span-2`} />
        <input type="date" name="contractDate" defaultValue={deal.contractDate} className={inputCls} title="Contract date" />
        <input type="date" name="soldDate" defaultValue={deal.soldDate} className={inputCls} title="Sold date" />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">
            Save
          </button>
        </div>
      </form>
      <form action={archiveDeal} className="mt-2">
        <input type="hidden" name="id" value={deal.id} />
        <button className="text-xs font-medium text-slate-400 hover:text-red-600">Archive deal</button>
      </form>
    </Card>
  );
}
