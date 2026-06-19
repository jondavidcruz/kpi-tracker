import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { saveClosing, deleteClosing, addClosingExpense, deleteClosingExpense } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const EXITS: [string, string][] = [["assignment", "Assignment"], ["novation", "Novation"], ["flip", "Flip / Wholetail"], ["listing", "Listing"], ["creative", "Creative"], ["other", "Other"]];
const STATUSES: [string, string][] = [["escrow", "In escrow"], ["closed", "Closed"], ["fell_through", "Fell through"]];
const STATUS_CLS: Record<string, string> = { escrow: "bg-amber-100 text-amber-700", closed: "bg-emerald-100 text-emerald-700", fell_through: "bg-slate-200 text-slate-500" };
// Common expense lines to make it one-tap to add the usual costs.
const PRESETS = ["Title / escrow fee", "Transaction coordinator", "Buyer-side concession", "EMD applied", "Marketing", "Wire / recording fee", "Agent commission", "Repairs credit", "Other"];
const SOURCES: [string, string][] = [["", "— source —"], ["ppl", "PPL"], ["sms", "SMS"], ["mail", "Direct mail"], ["other", "Other"]];
const FALLOUT: [string, string][] = [["", "— reason —"], ["financing", "Financing fell through"], ["title", "Title issue"], ["seller", "Seller backed out"], ["inspection", "Inspection"], ["no_buyer", "No buyer found"], ["other", "Other"]];

export default async function ClosingPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Escrow & Closing — restricted</h1>
        <p className="mt-1 text-sm text-slate-500">Managers only.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const closings = await db.closing.findMany({ include: { expenses: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const profitOf = (c: (typeof closings)[number]) => c.revenue - c.expenses.reduce((s, e) => s + e.amount, 0);
  const closed = closings.filter((c) => c.status === "closed");
  const inEscrow = closings.filter((c) => c.status === "escrow");
  const closedProfit = closed.reduce((s, c) => s + profitOf(c), 0);
  const escrowProjected = inEscrow.reduce((s, c) => s + profitOf(c), 0);

  return (
    <div className="space-y-5">
      <SectionTitle title="🏦 Escrow & Closing" subtitle="Track every expense on a deal in escrow and see the true net profit at close." accent="bg-emerald-500" />

      {/* Top-line summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">In escrow</div><div className="text-xl font-extrabold text-amber-600">{inEscrow.length}</div></Card>
        <Card className="p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Projected (escrow)</div><div className="text-xl font-extrabold text-slate-700 tabular-nums">{money(escrowProjected)}</div></Card>
        <Card className="p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Closed deals</div><div className="text-xl font-extrabold text-emerald-600">{closed.length}</div></Card>
        <Card className="p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Net profit (closed)</div><div className="text-xl font-extrabold text-emerald-700 tabular-nums">{money(closedProfit)}</div></Card>
      </div>

      {/* Add a closing */}
      <Card className="p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">+ Add a deal in escrow</p>
        <form action={saveClosing} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
          <input name="address" placeholder="Property address" className={`${inputCls} sm:col-span-4`} required />
          <input name="buyer" placeholder="Buyer" className={`${inputCls} sm:col-span-3`} />
          <select name="exit" defaultValue="assignment" className={`${inputCls} sm:col-span-2`}>{EXITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select name="source" defaultValue="" className={`${inputCls} sm:col-span-3`}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input name="revenue" type="number" step="0.01" placeholder="Revenue $" className={`${inputCls} sm:col-span-2`} />
          <input name="market" placeholder="Market (e.g. La Jolla)" className={`${inputCls} sm:col-span-3`} />
          <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 sm:col-span-12">Add deal</button>
        </form>
      </Card>

      {closings.length === 0 && <p className="text-sm text-slate-400">No deals tracked yet — add one above.</p>}

      {closings.map((c) => {
        const expTotal = c.expenses.reduce((s, e) => s + e.amount, 0);
        const profit = c.revenue - expTotal;
        const margin = c.revenue > 0 ? (profit / c.revenue) * 100 : 0;
        return (
          <Card key={c.id} className="p-4">
            {/* Header — editable */}
            <form action={saveClosing} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <input type="hidden" name="id" value={c.id} />
              <input name="address" defaultValue={c.address} className={`${inputCls} font-semibold sm:col-span-5`} />
              <input name="buyer" defaultValue={c.buyer} placeholder="Buyer" className={`${inputCls} sm:col-span-3`} />
              <select name="exit" defaultValue={c.exit} className={`${inputCls} sm:col-span-2`}>{EXITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <select name="status" defaultValue={c.status} className={`${inputCls} sm:col-span-2`}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <label className="text-xs sm:col-span-3"><span className="mb-0.5 block text-slate-500">Revenue in ($)</span><input name="revenue" type="number" step="0.01" defaultValue={c.revenue || ""} className={inputCls} /></label>
              <label className="text-xs sm:col-span-3"><span className="mb-0.5 block text-slate-500">Escrow opened</span><input name="openedDate" type="date" defaultValue={c.openedDate} className={inputCls} /></label>
              <label className="text-xs sm:col-span-3"><span className="mb-0.5 block text-slate-500">Close date</span><input name="closeDate" type="date" defaultValue={c.closeDate} className={inputCls} /></label>
              <label className="text-xs sm:col-span-3"><span className="mb-0.5 block text-slate-500">Lead source</span><select name="source" defaultValue={c.source} className={inputCls}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="text-xs sm:col-span-3"><span className="mb-0.5 block text-slate-500">Market</span><input name="market" defaultValue={c.market} placeholder="e.g. La Jolla" className={inputCls} /></label>
              <label className="text-xs sm:col-span-3"><span className="mb-0.5 block text-slate-500">If fell through — why?</span><select name="falloutReason" defaultValue={c.falloutReason} className={inputCls}>{FALLOUT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <input name="note" defaultValue={c.note} placeholder="note" className={`${inputCls} sm:col-span-3`} />
              <div className="flex items-center gap-2 sm:col-span-12">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_CLS[c.status]}`}>{STATUSES.find(([v]) => v === c.status)?.[1]}</span>
                <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">Save deal</button>
              </div>
            </form>

            {/* Expenses */}
            <div className="mt-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Expenses</div>
              <div className="space-y-1">
                {c.expenses.length === 0 && <div className="text-xs text-slate-400">No expenses yet — add each cost below.</div>}
                {c.expenses.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-slate-600">{e.label}</span>
                    <span className="tabular-nums font-semibold text-red-600">−{money(e.amount)}</span>
                    <form action={deleteClosingExpense}><input type="hidden" name="id" value={e.id} /><button className="text-slate-300 hover:text-red-600">×</button></form>
                  </div>
                ))}
              </div>
              <form action={addClosingExpense} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="closingId" value={c.id} />
                <input name="label" list={`exp-${c.id}`} placeholder="expense (e.g. Title / escrow fee)" className={`${inputCls} min-w-44 flex-1`} />
                <datalist id={`exp-${c.id}`}>{PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
                <input name="amount" type="number" step="0.01" placeholder="$ amount" className={`${inputCls} w-28`} />
                <button className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800">Add</button>
              </form>
            </div>

            {/* Net profit + margin */}
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
              <span>Revenue <strong className="tabular-nums">{money(c.revenue)}</strong></span>
              <span>Expenses <strong className="tabular-nums text-red-600">−{money(expTotal)}</strong></span>
              <span className="ml-auto text-base">Net profit <strong className={`tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money(profit)}</strong>{c.revenue > 0 ? <span className="ml-1 text-[11px] text-slate-400">({margin.toFixed(0)}% margin)</span> : null}</span>
              <form action={deleteClosing}><input type="hidden" name="id" value={c.id} /><button className="text-[11px] text-slate-300 hover:text-red-600">Delete deal</button></form>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
