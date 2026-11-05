import { getCurrentUser, isManager } from "@/lib/auth";
import { readUnderwrites } from "@/app/actions";
import { addrMatch, type UwRec } from "@/lib/underwrite-history";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";

// 🎯 Underwriting Calibration (moved into /underwriting, Jon 2026-11-04). Scores our underwrites
// against what actually closed — but ONLY for deals that got SIGNED + underwritten (and, once they
// close, predicted-vs-actual). Scratch underwrites that never became a signed deal are left out, so
// the signal isn't drowned by every number anyone ever ran. By-rep shows ACTIVE team only.

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const TAB_LABEL: Record<string, string> = {
  assignment: "🏠 Cash (Homes)", cash_land: "🌵 Cash (Land)", developer: "🏗️ Developer",
  novation: "📋 Novation", creative: "🔑 Creative", listing: "🏷️ Listing", flip: "🔨 Flip", rental: "🏘️ Buy & Hold",
};
// A deal counts as "signed" once its opportunity reaches a contract/won/closing stage.
const isSignedStage = (s?: string | null) => !!s && /sign|under contract|executed|\bwon\b|closing|assigned|closed/i.test(s);

export default async function CalibrationSection() {
  const me = await getCurrentUser();
  if (!isManager(me)) return null; // managers + leadership only

  const [uws, closed] = await Promise.all([
    readUnderwrites(),
    db.closedDeal.findMany({ select: { address: true, profit: true, closeDate: true, dealType: true } }),
  ]);

  // Which underwrites belong to a SIGNED deal? Look up the opp stage for each underwrite's oppId.
  const oppIds = [...new Set(uws.map((u) => u.oppId).filter(Boolean))] as string[];
  const opps = oppIds.length ? await db.crmOpportunity.findMany({ where: { id: { in: oppIds } }, select: { id: true, stage: true } }) : [];
  const stageOf = new Map(opps.map((o) => [o.id, o.stage]));

  type Row = UwRec & { actual?: { profit: number; closeDate: string; dealType: string } };
  const rowsAll: Row[] = uws.map((u) => {
    const hit = closed.find((c) => addrMatch(u.address, c.address));
    return hit ? { ...u, actual: { profit: hit.profit, closeDate: hit.closeDate, dealType: hit.dealType } } : u;
  });
  // Keep only underwrites tied to a signed deal (or already closed/matched).
  const rows = rowsAll.filter((r) => r.actual || (r.oppId && isSignedStage(stageOf.get(r.oppId))));

  const matched = rows.filter((r) => r.actual);
  const withFee = matched.filter((r) => r.fee > 0 && r.actual!.profit !== 0);
  const avgErr = withFee.length
    ? withFee.reduce((s, r) => s + (r.fee - r.actual!.profit) / Math.max(1, Math.abs(r.actual!.profit)), 0) / withFee.length * 100
    : null;
  const avgConf = rows.length ? Math.round(rows.reduce((s, r) => s + r.confidence, 0) / rows.length) : 0;

  // By rep — ACTIVE team only (Jon 2026-11-04: Austin's gone, don't list him).
  const activeNames = new Set((await db.user.findMany({ where: { active: true }, select: { name: true } })).map((u) => u.name.toLowerCase()));
  const byRep = new Map<string, { n: number; conf: number; matched: number }>();
  for (const r of rows) {
    if (!activeNames.has((r.by || "").toLowerCase())) continue;
    const g = byRep.get(r.by) ?? { n: 0, conf: 0, matched: 0 };
    g.n++; g.conf += r.confidence; if (r.actual) g.matched++;
    byRep.set(r.by, g);
  }

  return (
    <section id="calibration" className="scroll-mt-20 space-y-3">
      <div>
        <h2 className="text-lg font-extrabold text-slate-800">🎯 Underwriting Calibration</h2>
        <p className="text-sm text-slate-500">Signed deals only — scored against what actually closed. Is the team&apos;s gut running hot or cold?</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4 text-center"><div className="text-2xl font-extrabold text-slate-900">{rows.length}</div><div className="text-xs text-slate-500">Signed &amp; underwritten</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-extrabold text-slate-900">{matched.length}</div><div className="text-xs text-slate-500">Closed (predicted vs actual)</div></Card>
        <Card className="p-4 text-center"><div className={`text-2xl font-extrabold ${avgErr == null ? "text-slate-400" : Math.abs(avgErr) <= 15 ? "text-emerald-600" : "text-amber-600"}`}>{avgErr == null ? "—" : `${avgErr > 0 ? "+" : ""}${Math.round(avgErr)}%`}</div><div className="text-xs text-slate-500">Avg fee prediction error</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-extrabold text-slate-900">{avgConf}%</div><div className="text-xs text-slate-500">Avg confidence at sign</div></Card>
      </div>

      {avgErr != null && (
        <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${Math.abs(avgErr) <= 15 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {Math.abs(avgErr) <= 15
            ? `✅ Predictions are tracking within ±15% of actual profits — the formulas are calibrated.`
            : avgErr > 0
              ? `⚠️ Predicted fees run ${Math.round(avgErr)}% HOT vs actual profits — the team is over-promising. Tighten comps or widen spreads.`
              : `⚠️ Predicted fees run ${Math.round(-avgErr)}% COLD — offers may be leaving money on the table.`}
        </div>
      )}

      {byRep.size > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold text-slate-700">By rep (active team)</h3>
          <div className="flex flex-wrap gap-2">
            {[...byRep.entries()].map(([name, g]) => (
              <span key={name} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {name.split(" ")[0]}: {g.n} signed · avg conf {Math.round(g.conf / g.n)}% · {g.matched} closed
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-2">When · who</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">Address</th><th className="px-3 py-2 text-right">Predicted MAO</th><th className="px-3 py-2 text-right">Predicted fee</th><th className="px-3 py-2 text-right">Conf.</th><th className="px-4 py-2 text-right">Actual profit</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No signed deals underwritten yet. Once a deal you underwrote gets signed, it shows here; once it closes, the predicted-vs-actual fills in.</td></tr>}
            {rows.slice(0, 60).map((r) => {
              const delta = r.actual && r.fee > 0 ? r.fee - r.actual.profit : null;
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-500">{new Date(r.at).toLocaleDateString()} · {r.by.split(" ")[0]}</td>
                  <td className="px-3 py-2">{TAB_LABEL[r.tab] ?? r.tab}</td>
                  <td className="px-3 py-2 font-medium text-slate-700">{r.address || <span className="italic text-slate-300">no address</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.mao > 0 ? money(r.mao) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.fee > 0 ? money(r.fee) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.confidence}%</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {r.actual
                      ? <span className={delta != null && Math.abs(delta) / Math.max(1, r.actual.profit) <= 0.15 ? "text-emerald-600" : "text-amber-600"}>{money(r.actual.profit)}{delta != null ? ` (${delta > 0 ? "+" : ""}${money(delta)})` : ""}</span>
                      : <span className="text-slate-300">signed · open</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-[11px] text-slate-400">Only deals that reached a signed/contract stage are tracked here. Matching to closings is by street number + name; fee error = predicted fee vs the closed deal&apos;s profit.</p>
    </section>
  );
}
