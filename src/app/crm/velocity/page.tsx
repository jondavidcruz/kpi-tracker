import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { readPipelines } from "@/lib/crm";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// 📊 Pipeline Velocity (Jon 2026-10-16): where deals stall. Time-in-stage per
// lead, stuck-deal flags, and a stage funnel — all from the stage-change events
// we already log. Manager-only; pick the pipeline up top.
const DONE_STAGES = /nurture|dead|dnc|signed|won|lost|closed/i;
const STUCK_DAYS = 7; // a lead sitting this long in an ACTIVE stage is flagged

export default async function VelocityPage({ searchParams }: { searchParams: Promise<{ pl?: string }> }) {
  const me = await getCurrentUser();
  if (!isManager(me)) return <Card className="p-10 text-center text-slate-400">📊 Pipeline Velocity is a manager view.</Card>;
  const sp = await searchParams;
  const pipelines = await readPipelines();

  // default to the busiest pipeline (most open leads)
  const counts = await db.crmOpportunity.groupBy({ by: ["pipeline"], where: { archivedAt: null }, _count: { _all: true } });
  const plCount: Record<string, number> = {};
  for (const g of counts) { const n = g.pipeline === "" ? "War Room" : g.pipeline; plCount[n] = (plCount[n] ?? 0) + g._count._all; }
  const busiest = [...pipelines].sort((a, b) => (plCount[b.name] ?? 0) - (plCount[a.name] ?? 0))[0]?.name ?? pipelines[0].name;
  const plName = sp.pl && pipelines.some((p) => p.name === sp.pl) ? sp.pl : busiest;
  const pipe = pipelines.find((p) => p.name === plName) ?? pipelines[0];

  const where = plName === "War Room" ? { archivedAt: null, pipeline: { in: ["", "War Room"] } } : { archivedAt: null, pipeline: plName };
  const opps = await db.crmOpportunity.findMany({ where, select: { id: true, stage: true, createdAt: true, updatedAt: true, title: true, assignedTo: true, contact: { select: { name: true, address: true } } } });

  // latest stage-change timestamp per opp → time in CURRENT stage
  const oppIds = opps.map((o) => o.id);
  const stageEvents = oppIds.length
    ? await db.crmEvent.findMany({ where: { kind: "stage", oppId: { in: oppIds } }, orderBy: { at: "desc" }, select: { oppId: true, at: true } })
    : [];
  const lastStageAt = new Map<string, Date>();
  for (const e of stageEvents) if (!lastStageAt.has(e.oppId)) lastStageAt.set(e.oppId, e.at);

  const now = Date.now();
  const daysIn = (o: typeof opps[number]) => Math.floor((now - (lastStageAt.get(o.id) ?? o.createdAt).getTime()) / 86400_000);
  const daysQuiet = (o: typeof opps[number]) => Math.floor((now - o.updatedAt.getTime()) / 86400_000);

  // per-stage rollup, in pipeline order
  const byStage = new Map<string, typeof opps>();
  for (const o of opps) { const a = byStage.get(o.stage) ?? []; a.push(o); byStage.set(o.stage, a); }
  const rows = pipe.stages.map((st) => {
    const list = byStage.get(st.key) ?? [];
    const active = !DONE_STAGES.test(st.key);
    const ages = list.map(daysIn);
    const avg = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
    const oldest = ages.length ? Math.max(...ages) : 0;
    const stuck = active ? list.filter((o) => daysIn(o) >= STUCK_DAYS).length : 0;
    return { key: st.key, label: st.label, count: list.length, avg, oldest, stuck, active };
  });
  const maxCount = Math.max(1, ...rows.map((r) => r.count));
  const totalOpen = opps.length;

  // the worst-stuck active leads across the pipeline
  const stuckLeads = opps
    .filter((o) => !DONE_STAGES.test(o.stage) && daysIn(o) >= STUCK_DAYS)
    .map((o) => ({ id: o.id, name: o.contact.name, addr: o.contact.address || o.title, stage: pipe.stages.find((s) => s.key === o.stage)?.label ?? o.stage, days: daysIn(o), quiet: daysQuiet(o), who: o.assignedTo }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 40);
  const quietCount = opps.filter((o) => !DONE_STAGES.test(o.stage) && daysQuiet(o) >= 3).length;

  return (
    <div className="space-y-5">
      <SectionTitle title="📊 Pipeline Velocity" subtitle="Where deals stall — time in each stage, stuck-lead flags, and the funnel. Built from the stage history you already log." accent="bg-brand-gold"
        right={<Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Board</Link>} />

      {/* pipeline picker */}
      <div className="flex flex-wrap gap-1.5">
        {pipelines.filter((p) => (plCount[p.name] ?? 0) > 0).map((p) => (
          <Link key={p.name} href={`/crm/velocity?pl=${encodeURIComponent(p.name)}`} className={`rounded-full px-3 py-1 text-xs font-bold ${p.name === plName ? "bg-brand-navy text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{p.name} <span className="opacity-60">{plCount[p.name] ?? 0}</span></Link>
        ))}
      </div>

      {/* headline tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Open leads" value={totalOpen.toLocaleString()} />
        <Tile label="Stuck (7d+ in stage)" value={String(stuckLeads.length)} tone={stuckLeads.length ? "warn" : "ok"} />
        <Tile label="Quiet (no touch 3d+)" value={String(quietCount)} tone={quietCount ? "warn" : "ok"} />
        <Tile label="Avg age in stage" value={`${rows.filter((r) => r.active && r.count).length ? Math.round(rows.filter((r) => r.active && r.count).reduce((a, r) => a + r.avg * r.count, 0) / Math.max(1, rows.filter((r) => r.active).reduce((a, r) => a + r.count, 0))) : 0}d`} />
      </div>

      {/* per-stage table + funnel bar */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-extrabold text-slate-800">Time in stage — {plName}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-slate-400"><th className="py-1.5 pr-3">Stage</th><th className="px-3">Leads</th><th className="px-3">Avg days</th><th className="px-3">Oldest</th><th className="px-3">Stuck</th><th className="px-3 w-40">Share</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{r.label}{!r.active && <span className="ml-1 text-[10px] font-normal text-slate-400">(resting)</span>}</td>
                  <td className="px-3 tabular-nums text-slate-700">{r.count}</td>
                  <td className={`px-3 tabular-nums ${r.active && r.avg >= STUCK_DAYS ? "font-bold text-amber-700" : "text-slate-600"}`}>{r.count ? `${r.avg}d` : "—"}</td>
                  <td className={`px-3 tabular-nums ${r.active && r.oldest >= 30 ? "font-bold text-red-700" : "text-slate-500"}`}>{r.count ? `${r.oldest}d` : "—"}</td>
                  <td className="px-3 tabular-nums">{r.stuck ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{r.stuck}</span> : <span className="text-slate-300">0</span>}</td>
                  <td className="px-3"><div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-navy/70" style={{ width: `${Math.round((r.count / maxCount) * 100)}%` }} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Avg/Oldest = days since the lead last changed stage. Amber = averaging {STUCK_DAYS}d+ in an active stage; red = a lead 30d+ in stage. &quot;Resting&quot; stages (nurture/dead/signed) aren&apos;t flagged.</p>
      </Card>

      {/* stuck leads worklist */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-extrabold text-slate-800">🚨 Stuck leads — work these ({stuckLeads.length})</div>
        {stuckLeads.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-4 text-center text-xs font-semibold text-emerald-700">Nothing stuck — every active lead has moved within {STUCK_DAYS} days. 🎉</p>
        ) : (
          <div className="space-y-1">
            {stuckLeads.map((l) => (
              <Link key={l.id} href={`/crm/${l.id}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-100 hover:bg-slate-100">
                <span className="font-bold text-slate-800">{l.name}</span>
                <span className="truncate text-[11px] text-slate-400">{l.addr}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{l.stage}</span>
                <span className="ml-auto text-[11px] font-bold text-amber-700">{l.days}d in stage</span>
                {l.quiet >= 3 && <span className="text-[11px] font-semibold text-red-600">· quiet {l.quiet}d</span>}
                {l.who && <span className="text-[11px] text-slate-400">· {l.who.split(" ")[0]}</span>}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`rounded-xl p-3 ring-1 ${tone === "warn" ? "bg-amber-50 ring-amber-200" : tone === "ok" ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-2xl font-extrabold ${tone === "warn" ? "text-amber-800" : tone === "ok" ? "text-emerald-700" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}
