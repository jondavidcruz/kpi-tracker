import Link from "next/link";
import { saveClosingActual, deleteClosingActual, readClosingActuals, readUnderwrites } from "@/app/actions";
import { getCurrentUser, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import { COST_FIELDS, EXITS, actualClosingTotal, actualFee, accuracy, type ClosingActual } from "@/lib/closing-actuals";
import { addrMatch, type UwRec } from "@/lib/underwrite-history";

export const dynamic = "force-dynamic";

const money = (n: number) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : "—");
const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";

function VerdictChip({ label, predicted, actual }: { label: string; predicted: number; actual: number }) {
  const a = accuracy(predicted, actual);
  const cls = a.verdict === "on" ? "bg-emerald-100 text-emerald-800" : a.verdict === "hot" ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-700";
  const word = a.verdict === "on" ? "🎯 on target" : a.verdict === "hot" ? "🔥 we predicted high" : "🧊 we predicted low";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`} title={`${label}: predicted ${money(predicted)} vs actual ${money(actual)}`}>
      {label} {a.pct > 0 ? "+" : ""}{a.pct.toFixed(0)}% {word}
    </span>
  );
}

export default async function ClosingCalcPage({ searchParams }: { searchParams: Promise<{ saved?: string; err?: string }> }) {
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
  const [actuals, underwrites, recentClosings] = await Promise.all([
    readClosingActuals(),
    readUnderwrites(),
    db.closing.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { address: true } }),
  ]);

  // Latest matching underwrite per record (the prediction we're grading).
  const matchUw = (address: string): UwRec | null =>
    underwrites.find((u) => addrMatch(u.address, address)) ?? null;

  const withScores = actuals.map((a) => {
    const uw = matchUw(a.address);
    const closingTotal = actualClosingTotal(a);
    const fee = actualFee(a);
    return { a, uw, closingTotal, fee };
  });
  const scored = withScores.filter((x) => x.uw && x.a.contractPrice);
  const avgOfferDelta = scored.length
    ? scored.reduce((s, x) => s + Math.abs(((x.a.contractPrice! - x.uw!.mao) / (x.uw!.mao || 1)) * 100), 0) / scored.length
    : null;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="🧾 Closing Calculator"
        subtitle="Log the ACTUAL numbers when a deal closes — outcome + every real closing cost — and see how close the underwrite was. This is how the offers get sharper."
        accent="bg-emerald-500"
        right={<Link href="/underwriting" className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200">← Underwriting</Link>}
      />
      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}
      {sp.err === "address" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-300">Enter the property address first.</div>}

      {/* Scoreboard */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-slate-800">{actuals.length}</div><div className="text-[11px] font-semibold text-slate-500">Closings logged</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-slate-800">{scored.length}</div><div className="text-[11px] font-semibold text-slate-500">Matched to an underwrite</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-emerald-700">{avgOfferDelta === null ? "—" : `±${avgOfferDelta.toFixed(0)}%`}</div><div className="text-[11px] font-semibold text-slate-500">Avg offer accuracy (MAO vs contract)</div></Card>
        <Card className="p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-slate-800">{withScores.length ? money(withScores.reduce((s, x) => s + x.closingTotal, 0) / withScores.length) : "—"}</div><div className="text-[11px] font-semibold text-slate-500">Avg actual closing costs</div></Card>
      </div>

      {/* Log a closing */}
      <Card className="p-5">
        <h3 className="mb-1 text-sm font-bold text-slate-700">➕ Log a closing</h3>
        <p className="mb-3 text-xs text-slate-500">Fill it in from the settlement statement the day it closes. Matching to the saved underwrite is automatic (by address).</p>
        <form action={saveClosingActual} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="sm:col-span-2"><span className={labCls}>Property address</span>
              <input name="address" list="closing-addrs" placeholder="123 Main St…" className={inputCls} required />
              <datalist id="closing-addrs">{recentClosings.map((c, i) => <option key={i} value={c.address} />)}</datalist>
            </label>
            <label><span className={labCls}>Exit</span>
              <select name="exit" className={inputCls} defaultValue="assignment">{EXITS.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}</select>
            </label>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">🧾 Deal outcome</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label><span className={labCls}>Seller&apos;s asking price</span><input name="askPrice" placeholder="$" className={inputCls} /></label>
              <label><span className={labCls}>Under-contract price (A→B)</span><input name="contractPrice" placeholder="$" className={inputCls} /></label>
              <label><span className={labCls}>Sale / assignment price (B→C)</span><input name="salePrice" placeholder="$" className={inputCls} /></label>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">💸 Actual closing costs (from the settlement statement)</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {COST_FIELDS.map((f) => (
                <label key={String(f.key)}><span className={labCls}>{f.label}</span><input name={String(f.key)} placeholder="$" className={inputCls} /></label>
              ))}
              <label><span className={labCls}>&quot;Other&quot; note</span><input name="otherNote" placeholder="what was it?" className={inputCls} /></label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label><span className={labCls}>Actual net fee banked ($ — blank = computed)</span><input name="netFee" placeholder="$" className={inputCls} /></label>
            <label className="sm:col-span-2"><span className={labCls}>Notes</span><input name="notes" placeholder="anything unusual at the table…" className={inputCls} /></label>
          </div>
          <button className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Save closing</button>
        </form>
      </Card>

      {/* Records + accuracy */}
      <div className="space-y-3">
        {withScores.length === 0 && <Card className="p-8 text-center text-slate-400">No closings logged yet — the first settlement statement starts the accuracy loop.</Card>}
        {withScores.map(({ a, uw, closingTotal, fee }) => (
          <Card key={a.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-extrabold text-slate-800">{a.address}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">{a.exit.replace(/_/g, " ")}</span>
              <span className="text-[11px] text-slate-400">{new Date(a.at).toLocaleDateString()}{a.by ? ` · ${a.by.split(" ")[0]}` : ""}</span>
              <form action={deleteClosingActual} className="ml-auto"><input type="hidden" name="id" value={a.id} /><button className="text-[11px] text-slate-300 hover:text-red-600">remove</button></form>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { l: "Seller asked", v: a.askPrice },
                { l: "Contract (A→B)", v: a.contractPrice },
                { l: "Sold for (B→C)", v: a.salePrice },
                { l: "Actual closing costs", v: closingTotal || undefined },
                { l: "Actual fee", v: fee ?? undefined },
              ].map((x) => (
                <div key={x.l} className="rounded-lg bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-200">
                  <div className="text-[10px] text-slate-400">{x.l}</div>
                  <div className="text-sm font-extrabold tabular-nums text-slate-800">{x.v ? money(x.v) : "—"}</div>
                </div>
              ))}
            </div>

            {closingTotal > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COST_FIELDS.map((f) => {
                  const val = Number(a[f.key]) || 0;
                  if (!val) return null;
                  return <span key={String(f.key)} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">{f.label}{f.key === "other" && a.otherNote ? ` (${a.otherNote})` : ""}: <b>{money(val)}</b></span>;
                })}
              </div>
            )}

            {uw ? (
              <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                <div className="mb-1 text-[11px] font-bold text-slate-500">📐 vs the underwrite ({uw.tab.replace(/_/g, " ")} · {new Date(uw.at).toLocaleDateString()}{uw.by ? ` · ${uw.by.split(" ")[0]}` : ""} · confidence {uw.confidence}%)</div>
                <div className="flex flex-wrap gap-1.5">
                  {a.contractPrice ? <VerdictChip label={`MAO ${money(uw.mao)} → contract ${money(a.contractPrice)}`} predicted={uw.mao} actual={a.contractPrice} /> : null}
                  {fee !== null && uw.fee > 0 ? <VerdictChip label={`Fee ${money(uw.fee)} → ${money(fee)}`} predicted={uw.fee} actual={fee} /> : null}
                  {closingTotal > 0 ? <VerdictChip label={`Closing ~$1,500 → ${money(closingTotal)}`} predicted={1500} actual={closingTotal} /> : null}
                </div>
              </div>
            ) : (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">No saved underwrite matched this address — export offers from the calculator and future closings grade automatically.</div>
            )}
            {a.notes && <p className="mt-1.5 text-[12px] italic text-slate-500">{a.notes}</p>}
          </Card>
        ))}
      </div>

      <p className="text-xs text-slate-400">🎯 = within ±15% (same convention as Admin → Calibration). 🔥 we predicted high · 🧊 we predicted low. The closing-cost chip grades our flat ~$1,500 all-in assumption from the land calculator.</p>
    </div>
  );
}
