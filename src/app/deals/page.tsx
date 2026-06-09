import { archiveDeal, saveDeal } from "@/app/actions";
import { getActiveDeals, getActiveReps, getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { analyzeDeal, agingClasses } from "@/lib/deals";
import { Card, SectionTitle } from "@/components/ui";
import type { Deal } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = [
  { key: "under_contract", label: "Under Contract", cls: "bg-sky-100 text-sky-800" },
  { key: "marketing", label: "Marketing", cls: "bg-amber-100 text-amber-800" },
  { key: "buyer_found", label: "Buyer Found", cls: "bg-violet-100 text-violet-800" },
  { key: "in_escrow", label: "In Escrow", cls: "bg-indigo-100 text-indigo-800" },
  { key: "closed", label: "Closed", cls: "bg-emerald-100 text-emerald-800" },
  { key: "dead", label: "Dead", cls: "bg-slate-200 text-slate-600" },
];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const lblCls = "block text-[11px] font-semibold text-slate-500 mb-0.5";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const deals = await getActiveDeals();
  const reps = await getActiveReps();
  const dispoReps = reps.filter((r) => r.position === "dispositions").map((r) => r.name);
  // include any names already on deals (e.g. legacy "Sharyn") so they still show.
  const repNames = Array.from(new Set([...dispoReps, ...deals.map((d) => d.assignedTo).filter(Boolean)]));

  const byStatus = STATUSES.map((s) => ({ ...s, count: deals.filter((d) => d.status === s.key).length }));
  const openCount = deals.filter((d) => !["dead", "closed"].includes(d.status)).length;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="🤝 Deals Board"
        subtitle="Dispositions pipeline with real-time aging & next-step tracking."
        accent="bg-brand-gold"
        right={<span className="text-sm font-semibold text-slate-500">{openCount} active</span>}
      />

      {sp.saved && (
        <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
          ✓ Saved.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {byStatus.map((s) => (
          <Card key={s.key} className="p-3 text-center">
            <div className={`mx-auto mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>{s.label}</div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-800">{s.count}</div>
          </Card>
        ))}
      </div>

      {/* Add a deal (compact) */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">+ Add a deal</h3>
        <form action={saveDeal} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input name="address" placeholder="Property address *" className={`${inputCls} sm:col-span-2`} required />
          <select name="status" defaultValue="under_contract" className={inputCls}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select name="assignedTo" defaultValue="" className={inputCls}>
            <option value="">assign to…</option>
            {repNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <input name="dealType" placeholder="Type (Novation…)" className={inputCls} />
          <input name="contractPrice" placeholder="Contract $" className={inputCls} />
          <input name="assignmentFee" placeholder="Est. profit $" className={inputCls} />
          <input type="date" name="onMarketSince" className={inputCls} title="On market since" />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Add deal
          </button>
        </form>
      </Card>

      {/* Deal cards (full detail + aging) */}
      <div className="space-y-3">
        {deals.length === 0 && (
          <Card className="p-10 text-center text-slate-400">No deals yet. Add your first one above.</Card>
        )}
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} today={today} repNames={repNames} />
        ))}
      </div>
    </div>
  );
}

function DealCard({ deal, today, repNames }: { deal: Deal; today: string; repNames: string[] }) {
  const st = STATUSES.find((s) => s.key === deal.status) ?? STATUSES[0];
  const isLive = !["dead", "closed"].includes(deal.status);
  const aging = analyzeDeal(deal, today);

  return (
    <Card className="p-4">
      {/* Header row: status, address, aging badge */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
        <span className="flex-1 font-bold text-slate-800">{deal.address}</span>
        {isLive && aging.days !== null && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${agingClasses(aging.level)}`}>
            {aging.days}d on market
          </span>
        )}
      </div>

      {/* Recommendation banner (only when there's something to act on) */}
      {isLive && (aging.level !== "fresh" || (aging.contractDaysLeft !== null && aging.contractDaysLeft <= 7)) && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${agingClasses(aging.level)}`}>
          💡 {aging.recommendation}
        </div>
      )}

      <form action={saveDeal} className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        <input type="hidden" name="id" value={deal.id} />

        <Field label="Address" full><input name="address" defaultValue={deal.address} className={inputCls} /></Field>
        <Field label="Status">
          <select name="status" defaultValue={deal.status} className={inputCls}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Dispo rep">
          <select name="assignedTo" defaultValue={deal.assignedTo} className={inputCls}>
            <option value="">—</option>
            {repNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>

        <Field label="Type"><input name="dealType" defaultValue={deal.dealType} className={inputCls} placeholder="Novation…" /></Field>
        <Field label="Source"><input name="source" defaultValue={deal.source} className={inputCls} placeholder="PPL…" /></Field>
        <Field label="LM/AQ credit"><input name="lmAq" defaultValue={deal.lmAq} className={inputCls} /></Field>
        <Field label="Buyer"><input name="buyerName" defaultValue={deal.buyerName} className={inputCls} /></Field>

        <Field label="Contract $"><input name="contractPrice" defaultValue={deal.contractPrice ?? ""} className={inputCls} /></Field>
        <Field label="Asking $"><input name="askingPrice" defaultValue={deal.askingPrice ?? ""} className={inputCls} /></Field>
        <Field label="Est. profit $"><input name="assignmentFee" defaultValue={deal.assignmentFee ?? ""} className={inputCls} /></Field>
        <Field label="Sold $"><input name="soldPrice" defaultValue={deal.soldPrice ?? ""} className={inputCls} /></Field>

        {/* Key dates */}
        <Field label="Contract signed"><input type="date" name="contractDate" defaultValue={deal.contractDate} className={inputCls} /></Field>
        <Field label={dateLbl("Contract expires", aging.contractDaysLeft)}>
          <input type="date" name="contractExpiration" defaultValue={deal.contractExpiration} className={inputCls} />
        </Field>
        <Field label="On market since"><input type="date" name="onMarketSince" defaultValue={deal.onMarketSince} className={inputCls} /></Field>
        <Field label="Listing signed"><input type="date" name="listingSignedDate" defaultValue={deal.listingSignedDate} className={inputCls} /></Field>
        <Field label={dateLbl("Listing expires", aging.listingDaysLeft)}>
          <input type="date" name="listingExpiration" defaultValue={deal.listingExpiration} className={inputCls} />
        </Field>
        <Field label="Sold date"><input type="date" name="soldDate" defaultValue={deal.soldDate} className={inputCls} /></Field>

        {/* Next steps + notes */}
        <Field label="📋 Next steps" full>
          <textarea name="nextSteps" defaultValue={deal.nextSteps} rows={2} className={inputCls}
            placeholder="Where are we at? What's the plan to get it sold?" />
        </Field>
        <Field label="Notes" full>
          <textarea name="notes" defaultValue={deal.notes} rows={2} className={inputCls} />
        </Field>

        <div className="sm:col-span-3 lg:col-span-4 flex items-center gap-3">
          <button className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">Save</button>
        </div>
      </form>

      <form action={archiveDeal} className="mt-2">
        <input type="hidden" name="id" value={deal.id} />
        <button className="text-xs font-medium text-slate-400 hover:text-red-600">Archive deal</button>
      </form>
    </Card>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={full ? "sm:col-span-3 lg:col-span-4" : ""}>
      <span className={lblCls}>{label}</span>
      {children}
    </label>
  );
}

/** Append a days-left hint to a date label when an expiration is near/past. */
function dateLbl(base: string, daysLeft: number | null): string {
  if (daysLeft === null) return base;
  if (daysLeft < 0) return `${base} ⚠️ ${Math.abs(daysLeft)}d ago`;
  if (daysLeft <= 14) return `${base} (${daysLeft}d left)`;
  return base;
}
