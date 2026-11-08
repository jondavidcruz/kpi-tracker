import { getCurrentUser, canAccessCSuite, isOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import ExpenseAdvisor from "@/components/ExpenseAdvisor";
import FinancialHealth from "@/components/FinancialHealth";
import PnlLoader from "@/components/PnlLoader";
import PnlStatement from "@/components/PnlStatement";
import CurrentStack from "@/components/CurrentStack";
import { mergePnl, summarize, DEFAULT_ASSUMPTIONS, PNL_DATA_CAT, PNL_OVERRIDES_CAT, PNL_RUNWAY_CAT, PNL_CATS, type PnlAssumptions, type PnlStore, type PnlOverrides, type PnlCat } from "@/lib/pnl-sheet";
import { PNL_STACK_CAT, type StackStore } from "@/lib/pnl-stack";
import { parseHourly, parseFlatDailyHours } from "@/lib/payroll";

export const dynamic = "force-dynamic";

// 📊 Profit & Loss — the single, visual, Excel-synced P&L (Jon 2026-11-07). The real figures live in the
// private DB (never this public repo). Top = Financial Health cockpit (burn/runway/close-target); below =
// the full monthly statement with every line item, a donut, cross-month bars, and owner label editing.
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!me || !canAccessCSuite(me)) {
    return <Card className="mx-auto max-w-md p-8 text-center text-slate-500">🔒 This page is restricted to the C-suite (Jon, Viktoriia, Enrico).</Card>;
  }
  const sp = await searchParams;

  const [pnlRow, runwayRow, ovRow, spendRow, stackRow, users, profiles] = await Promise.all([
    db.resource.findFirst({ where: { category: PNL_DATA_CAT } }).catch(() => null),
    db.resource.findFirst({ where: { category: PNL_RUNWAY_CAT } }).catch(() => null),
    db.resource.findFirst({ where: { category: PNL_OVERRIDES_CAT } }).catch(() => null),
    db.resource.findFirst({ where: { category: "__telnyx_spend__" } }).catch(() => null),
    db.resource.findFirst({ where: { category: PNL_STACK_CAT } }).catch(() => null),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true } }).catch(() => []),
    db.teamProfile.findMany({ select: { userId: true, name: true, payScale: true, payPeriod: true } }).catch(() => []),
  ]);

  let pnlStore: PnlStore | null = null;
  try { if (pnlRow?.description) pnlStore = JSON.parse(pnlRow.description) as PnlStore; } catch { pnlStore = null; }
  const pnlRows = mergePnl(pnlStore);
  const year = pnlStore?.year ?? new Date().getUTCFullYear();

  let assume: PnlAssumptions = { ...DEFAULT_ASSUMPTIONS };
  try { if (runwayRow?.description) { const a = JSON.parse(runwayRow.description); assume = { cashOnHand: Number(a.cashOnHand) || 0, avgFee: Number(a.avgFee) || 10000, profitTarget: Number(a.profitTarget) || 0 }; } } catch { /* defaults */ }
  const pnlSummary = summarize(assume, pnlRows);

  let overrides: PnlOverrides = {};
  try { if (ovRow?.description) overrides = JSON.parse(ovRow.description) as PnlOverrides; } catch { overrides = {}; }

  // live Telnyx spend snapshot (daily ?telnyxspend=1 cron)
  let telnyx: { at?: string; month?: string; sms?: { cost: number; count: number }; voice?: { cost: number; count: number }; mtd?: number; projected?: number; balance?: number | null; shortCalls?: { count: number; pct: number } } | null = null;
  try { telnyx = spendRow?.description ? JSON.parse(spendRow.description) : null; } catch { telnyx = null; }

  // Cut-the-fat AI advisor — fed from the sheet (sum each category across closed months + top lines).
  const closed = pnlRows.filter((m) => m.expenses > 0);
  const categories = PNL_CATS.map((c) => ({ name: c.label, total: Math.round(closed.reduce((s, m) => s + ((m[c.key as PnlCat] as number) || 0), 0)) }));
  const lineAgg: Record<string, { label: string; category: string; total: number }> = {};
  for (const m of closed) for (const l of m.lines || []) { const k = `${l.cat}|${l.label.toLowerCase()}`; (lineAgg[k] ||= { label: l.label, category: l.cat, total: 0 }).total += l.actual; }
  const topLines = Object.values(lineAgg).sort((a, b) => b.total - a.total).slice(0, 14).map((l) => ({ label: l.label, category: l.category, monthly: Math.round(l.total / Math.max(1, closed.length)) }));
  const advisorData = JSON.stringify({
    business: "San Diego real-estate wholesaling, small team, currently unprofitable",
    ytd: { income: Math.round(pnlSummary.ytdRevenue), expenses: Math.round(pnlSummary.ytdExpenses), net: Math.round(pnlSummary.ytdNet) },
    burnRatePerMonth: Math.round(pnlSummary.burnRate),
    categories, topLines,
  });

  // 🧾 Current Stack (editable go-forward cost). Real figures live in the private DB (__pnl_stack__).
  let stackStore: StackStore = { items: [] };
  try { if (stackRow?.description) stackStore = JSON.parse(stackRow.description) as StackStore; } catch { stackStore = { items: [] }; }

  // Per-person payroll SEED, computed from the roster's own pay rates (teamProfile.payScale — the same
  // source the payday email uses). Hourly → rate × hours/day × 5 days × (52/12). Flat-hours people (Marie)
  // use their flat daily hours; everyone else defaults to 8h/day (Jon edits any of it). Salaried people
  // (a plain $ amount, no "/hr") seed at that monthly number. Jon (owner) is the variable CEO draw below.
  const WEEKS_PER_MONTH = 52 / 12;
  const profByUser = new Map(profiles.map((p) => [p.userId ?? "", p]));
  const peopleSeed: { cat: PnlCat; label: string; amount: number; person: boolean }[] = [];
  for (const u of users) {
    const first = u.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first === "jon" || first === "jonathan") continue; // CEO draw handled separately
    const prof = profByUser.get(u.id);
    const ps = prof?.payScale || "";
    const rate = parseHourly(ps);
    let monthly = 0;
    if (rate != null) {
      const dailyH = parseFlatDailyHours(ps) ?? 8;
      monthly = rate * dailyH * 5 * WEEKS_PER_MONTH;
    } else {
      const num = Number(ps.replace(/[^0-9.]/g, ""));
      if (num > 0 && num < 50000) monthly = num; // a monthly salary figure (skip blanks / "commission")
    }
    if (monthly > 0) peopleSeed.push({ cat: "payroll", label: prof?.name || u.name, amount: Math.round(monthly), person: true });
    // Salaried C-suite (Viktoriia, Enrico) have no hourly/flat pay scale — seed them as a $0
    // placeholder so they're never silently left out of the stack; Jon types the salary in Edit.
    else if (first === "viktoriia" || first === "enrico") peopleSeed.push({ cat: "payroll", label: prof?.name || u.name, amount: 0, person: true });
  }
  peopleSeed.sort((a, b) => b.amount - a.amount);
  // CEO draw (variable) — latest month in the sheet that recorded one.
  let ceoDraw = 0;
  for (const mm of pnlRows) { const l = (mm.lines || []).find((x) => x.cat === "payroll" && /ceo/i.test(x.label)); if (l) ceoDraw = l.actual; }
  if (ceoDraw > 0) peopleSeed.push({ cat: "payroll", label: "CEO draw (Jon)", amount: Math.round(ceoDraw), person: true });

  // Non-payroll seed = the latest closed month's tool/dues/real-estate/controllable lines (a realistic
  // starting point; Jon deletes anything he's since cancelled).
  const latestClosed = closed[closed.length - 1] || pnlRows[0];
  const monthSeed = {
    month: latestClosed.month,
    items: (latestClosed.lines || []).filter((l) => l.cat !== "payroll").map((l) => ({ cat: l.cat, label: l.label, amount: l.actual })),
  };

  return (
    <div className="space-y-5 pb-24">
      <SectionTitle
        title="📊 Profit & Loss Report"
        subtitle="The real cost to run Freedom Offers — every month, synced from your accountant's P&L. Private to the C-suite."
        accent="bg-emerald-500"
        right={<span className="text-xs text-slate-400">Jon · Viktoriia · Enrico</span>}
      />

      {/* 📗 Financial Health cockpit — burn / runway / cost-to-run / close-target */}
      <FinancialHealth pnl={pnlRows} summary={pnlSummary} assume={assume} saved={sp.saved === "runway"} asOf={pnlStore?.asOf} />

      {/* 🧾 Current Stack — editable, go-forward true cost (per-person payroll + cut simulator) */}
      <CurrentStack initial={stackStore} peopleSeed={peopleSeed} monthSeed={monthSeed} canEdit={isOwner(me)} trailingBurn={pnlSummary.burnRate} cash={assume.cashOnHand} avgFee={assume.avgFee} />

      {isOwner(me) && <PnlLoader />}

      {telnyx?.month === new Date().toISOString().slice(0, 7) && (
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">📡 Telnyx — this month so far</div>
            <div className="text-2xl font-extrabold text-slate-900">${(telnyx.mtd ?? 0).toFixed(2)}</div>
          </div>
          <div className="text-sm text-slate-600">
            <div>💬 Texts: <b>${(telnyx.sms?.cost ?? 0).toFixed(2)}</b> · {telnyx.sms?.count ?? 0} messages</div>
            <div>📞 Calls: <b>${(telnyx.voice?.cost ?? 0).toFixed(2)}</b> · {telnyx.voice?.count ?? 0} calls</div>
          </div>
          <div className="text-sm text-slate-600">
            <div>📈 Projected month: <b>${(telnyx.projected ?? 0).toFixed(2)}</b></div>
            {telnyx.balance != null && <div>💳 Account balance: <b>${telnyx.balance.toFixed(2)}</b></div>}
          </div>
          <span className="ml-auto text-[10px] text-slate-400">covers War Room + Direct REI lines · refreshes daily{telnyx.at ? ` · last ${new Date(telnyx.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</span>
        </Card>
      )}

      {/* The full monthly statement — visual, every line item, owner-editable labels */}
      {closed.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">No P&amp;L data loaded yet. {isOwner(me) ? "Use “📥 Load / update P&L data” above." : "Ask Jon to sync the P&L sheet."}</Card>
      ) : (
        <PnlStatement months={pnlRows} overrides={overrides} canEdit={isOwner(me)} year={year} />
      )}

      {/* Cut-the-fat AI advisor */}
      <ExpenseAdvisor data={advisorData} />
    </div>
  );
}
