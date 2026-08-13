import { getCurrentUser, isManager } from "@/lib/auth";
import { readCfdNotes, saveCfdNote, deleteCfdNote } from "@/app/actions";
import { CFD_STATUSES, cfdStatusMeta, type CfdNote } from "@/lib/cfd";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const lbl = "block text-[11px] font-semibold text-slate-500 mb-0.5";
const money = (n?: number) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

export default async function CfdNotesPage() {
  const me = await getCurrentUser();
  const canEdit = !!me && (isManager(me) || me.position === "dispositions");
  if (!canEdit) {
    return <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"><div className="mb-2 text-3xl">🔒</div><h1 className="text-xl font-bold">Managers & dispositions only</h1></div>;
  }
  const notes = await readCfdNotes();
  const active = notes.filter((n) => n.status !== "paid_off");
  const monthlyIncome = active.reduce((s, n) => s + (n.monthlyAmount ?? 0), 0);
  const late = notes.filter((n) => n.status === "late" || n.status === "defaulted");

  const Row = ({ n }: { n: CfdNote }) => {
    const st = cfdStatusMeta(n.status);
    return (
      <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">{n.parcel || "—"}</span>
          <span className="text-slate-500">· {n.buyer || "—"}</span>
          <span className="ml-auto font-semibold text-emerald-700 dark:text-emerald-300">{money(n.monthlyAmount)}/mo</span>
          {n.nextDue && <span className="text-xs text-slate-400">due {n.nextDue}</span>}
          {n.taxesInvoiced === false && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">taxes?</span>}
        </summary>
        <form action={saveCfdNote} className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          <input type="hidden" name="id" value={n.id} />
          <label><span className={lbl}>Parcel / APN</span><input name="parcel" defaultValue={n.parcel} className={inputCls} /></label>
          <label><span className={lbl}>Buyer</span><input name="buyer" defaultValue={n.buyer} className={inputCls} /></label>
          <label><span className={lbl}>Down payment</span><input name="downPayment" type="number" defaultValue={n.downPayment ?? ""} className={inputCls} /></label>
          <label><span className={lbl}>Monthly amount</span><input name="monthlyAmount" type="number" defaultValue={n.monthlyAmount ?? ""} className={inputCls} /></label>
          <label><span className={lbl}>Rate %</span><input name="rate" type="number" step="any" defaultValue={n.rate ?? ""} className={inputCls} /></label>
          <label><span className={lbl}>Term (yrs)</span><input name="term" type="number" defaultValue={n.term ?? ""} className={inputCls} /></label>
          <label><span className={lbl}>Next due</span><input name="nextDue" type="date" defaultValue={n.nextDue ?? ""} className={inputCls} /></label>
          <label><span className={lbl}>Status</span>
            <select name="status" defaultValue={n.status} className={inputCls}>{CFD_STATUSES.map((s) => <option key={s} value={s}>{cfdStatusMeta(s).label}</option>)}</select>
          </label>
          <label className="col-span-2 flex items-center gap-1.5 pt-5 text-[13px] text-slate-600"><input type="checkbox" name="taxesInvoiced" defaultChecked={!!n.taxesInvoiced} className="h-4 w-4" /> Taxes invoiced</label>
          <label className="col-span-2 sm:col-span-4"><span className={lbl}>Notes</span><input name="notes" defaultValue={n.notes ?? ""} className={inputCls} /></label>
          <div className="col-span-2 flex gap-2 sm:col-span-4">
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">Save</button>
          </div>
        </form>
        <form action={deleteCfdNote} className="mt-1"><input type="hidden" name="id" value={n.id} /><button className="text-xs text-slate-400 hover:text-red-600">Delete note</button></form>
      </details>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle title="📜 CFD / Owner-Finance Notes" subtitle="Contract-for-deed ledger — payments, due dates, status. About half of CFD buyers default by design; flag lates early and turn defaults into resale tasks." accent="bg-emerald-500" />

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{active.length}</div><div className="text-xs text-slate-500">Active notes</div></Card>
        <Card className="p-4"><div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">{money(monthlyIncome)}</div><div className="text-xs text-slate-500">Monthly income</div></Card>
        <Card className="p-4"><div className="text-2xl font-extrabold text-red-600">{late.length}</div><div className="text-xs text-slate-500">Late / defaulted</div></Card>
      </div>

      {/* Add new */}
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">➕ Add a note</h3>
        <form action={saveCfdNote} className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          <label><span className={lbl}>Parcel / APN</span><input name="parcel" className={inputCls} /></label>
          <label><span className={lbl}>Buyer</span><input name="buyer" className={inputCls} /></label>
          <label><span className={lbl}>Down payment</span><input name="downPayment" type="number" className={inputCls} /></label>
          <label><span className={lbl}>Monthly amount</span><input name="monthlyAmount" type="number" className={inputCls} /></label>
          <label><span className={lbl}>Rate %</span><input name="rate" type="number" step="any" className={inputCls} /></label>
          <label><span className={lbl}>Term (yrs)</span><input name="term" type="number" className={inputCls} /></label>
          <label><span className={lbl}>Next due</span><input name="nextDue" type="date" className={inputCls} /></label>
          <label><span className={lbl}>Status</span><select name="status" defaultValue="current" className={inputCls}>{CFD_STATUSES.map((s) => <option key={s} value={s}>{cfdStatusMeta(s).label}</option>)}</select></label>
          <div className="col-span-2 sm:col-span-4"><button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Add note</button></div>
        </form>
      </Card>

      <div className="space-y-2">
        {notes.length === 0 ? <Card className="p-8 text-center text-sm text-slate-400">No CFD notes yet.</Card> : notes.map((n) => <Row key={n.id} n={n} />)}
      </div>
    </div>
  );
}
