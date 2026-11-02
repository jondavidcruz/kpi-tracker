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

  // ── Conversion funnel + time-to-signed ───────────────────────────────────────────────
  // How well deals advance stage→stage, and the median days to a signed/won outcome. Built
  // from the SAME stage events, but INCLUDING archived deals so drop-offs (dead) and closed
  // deals both count (Jon 2026-11-02). "Reached" a stage = ever touched it (from the
  // "old → new" event bodies) or sits at/after it now.
  const SUCCESS = /sign|won|closed|contract/i;
  const convWhere = plName === "War Room" ? { pipeline: { in: ["", "War Room"] } } : { pipeline: plName };
  const allOpps = await db.crmOpportunity.findMany({ where: convWhere, select: { id: true, stage: true, createdAt: true } });
  const allIds = allOpps.map((o) => o.id);
  const allStageEv = allIds.length
    ? await db.crmEvent.findMany({ where: { kind: "stage", oppId: { in: allIds } }, orderBy: { at: "asc" }, select: { oppId: true, at: true, body: true } })
    : [];
  const touchedByOpp = new Map<string, Set<string>>();
  const firstSuccessAt = new Map<string, Date>();
  for (const e of allStageEv) {
    const parts = String(e.body ?? "").split(/→|->/).map((s) => s.trim()).filter(Boolean);
    const set = touchedByOpp.get(e.oppId) ?? new Set<string>();
    parts.forEach((p) => set.add(p));
    touchedByOpp.set(e.oppId, set);
    const newStage = parts[parts.length - 1] ?? "";
    if (SUCCESS.test(newStage) && !firstSuccessAt.has(e.oppId)) firstSuccessAt.set(e.oppId, e.at);
  }
  const activeSteps = pipe.stages.filter((s) => !DONE_STAGES.test(s.key));
  const stepIdx = new Map(activeSteps.map((s, i) => [s.key, i] as const));
  const furthest = new Map<string, number>();
  const succ = new Map<string, boolean>();
  for (const o of allOpps) {
    const touched = touchedByOpp.get(o.id) ?? new Set<string>();
    touched.add(o.stage);
    let f = -1, s = SUCCESS.test(o.stage);
    for (const k of touched) { const i = stepIdx.get(k); if (i != null && i > f) f = i; if (SUCCESS.test(k)) s = true; }
    furthest.set(o.id, f); succ.set(o.id, s);
  }
  const reached = activeSteps.map((_, i) => allOpps.reduce((n, o) => n + ((furthest.get(o.id) ?? -1) >= i ? 1 : 0), 0));
  const successCount = allOpps.reduce((n, o) => n + (succ.get(o.id) ? 1 : 0), 0);
  const convRows = activeSteps.map((st, i) => {
    const r = reached[i];
    const isLast = i === activeSteps.length - 1;
    const next = isLast ? successCount : reached[i + 1];
    const nextLabel = isLast ? "Signed / Won" : activeSteps[i + 1].label;
    return { key: st.key, label: st.label, reached: r, next, nextLabel, rate: r > 0 ? Math.round((next / r) * 100) : null };
  });
  const closeDurs: number[] = [];
  for (const o of allOpps) { const sAt = firstSuccessAt.get(o.id); if (sAt) closeDurs.push((sAt.getTime() - o.createdAt.getTime()) / 86400_000); }
  closeDurs.sort((a, b) => a - b);
  const medianClose = closeDurs.length ? closeDurs[Math.floor((closeDurs.length - 1) / 2)] : null;

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
        <Tile label="Median → Signed" value={medianClose != null ? `${Math.round(medianClose)}d` : "—"} sub={`${closeDurs.length} closed`} />
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

      {/* conversion funnel — how well deals advance stage → stage (incl. closed & dropped) */}
      <Card className="p-4">
        <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-extrabold text-slate-800">Conversion funnel — {plName}</div>
          <div className="text-[12px] font-semibold text-slate-500">Median time to signed: <span className="text-emerald-700">{medianClose != null ? `${Math.round(medianClose)}d` : "—"}</span> <span className="text-slate-400">({closeDurs.length} closed)</span></div>
        </div>
        <p className="mb-2 text-[11px] text-slate-400">Of every deal that reached a stage, the share that advanced to the next one. Low % = where deals fall out. Counts all {allOpps.length.toLocaleString()} deals in this pipeline, including dead/archived and signed.</p>
        <div className="space-y-1.5">
          {convRows.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-sm">
              <div className="w-36 shrink-0 truncate font-semibold text-slate-700">{c.label}</div>
              <div className="w-14 shrink-0 tabular-nums text-right text-slate-500">{c.reached.toLocaleString()}</div>
              <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-slate-100">
                <div className={`h-full rounded-md ${c.rate == null ? "bg-slate-200" : c.rate >= 60 ? "bg-emerald-400/80" : c.rate >= 30 ? "bg-amber-400/80" : "bg-red-400/80"}`} style={{ width: `${c.rate ?? 0}%` }} />
              </div>
              <div className="w-28 shrink-0 text-right text-[11px] font-bold text-slate-600">{c.rate == null ? "—" : `${c.rate}%`} <span className="font-normal text-slate-400">→ {c.nextLabel.length > 10 ? c.nextLabel.slice(0, 10) + "…" : c.nextLabel}</span></div>
            </div>
          ))}
          {convRows.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">No active stages to chart for this pipeline.</p>}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">The count column = how many deals ever reached that stage. Deals created before stage-logging count from their current stage onward.</p>
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

function Tile({ label, value, tone, sub }: { label: string; value: string; tone?: "ok" | "warn"; sub?: string }) {
  return (
    <div className={`rounded-xl p-3 ring-1 ${tone === "warn" ? "bg-amber-50 ring-amber-200" : tone === "ok" ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-2xl font-extrabold ${tone === "warn" ? "text-amber-800" : tone === "ok" ? "text-emerald-700" : "text-slate-800"}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
