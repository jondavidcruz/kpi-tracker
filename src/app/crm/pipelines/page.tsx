import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { readPipelines } from "@/lib/crm";
import PipelinesEditor from "@/components/PipelinesEditor";
import { readPipelineCrm, crmGroupOf, dispoKind } from "@/lib/pipeline-crm";

export const dynamic = "force-dynamic";

// 🔀 Pipelines — rename anything, add stages & whole pipelines, in its own room.
export default async function CrmPipelinesPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!me || !canAccessCSuite(me)) return <Card className="p-10 text-center text-slate-400">🔒 System Settings — C-suite only.</Card>;
  const saved = (await searchParams).saved ?? "";
  const flash: { ok: boolean; msg: string } | null =
    saved === "saved" ? { ok: true, msg: "✓ Pipeline saved." }
    : saved === "created" ? { ok: true, msg: "✓ Pipeline created." }
    : saved === "deleted" ? { ok: true, msg: "✓ Pipeline deleted." }
    : saved === "empty" ? { ok: false, msg: "⚠️ Nothing saved — a pipeline needs a name and at least one stage." }
    : saved.startsWith("hasleads:") ? { ok: false, msg: `⚠️ Can't delete “${decodeURIComponent(saved.slice(9))}” — it still has live leads. Move or archive them first, then delete.` }
    : saved === "all" ? { ok: true, msg: "✓ All pipelines saved." }
    : null;
  const pipelines = await readPipelines();
  const crmMap = await readPipelineCrm();
  const counts = await db.crmOpportunity.groupBy({ by: ["pipeline"], where: { archivedAt: null }, _count: { _all: true } });
  const plCounts: Record<string, number> = {};
  for (const c of counts) plCounts[c.pipeline || "War Room"] = c._count._all;

  return (
    <div className="space-y-4">
      <SectionTitle title="🔀 Pipelines" subtitle="Grouped by CRM — Acquisitions vs Dispositions. Set each pipeline's CRM with its dropdown, rename, reorder stages, add/remove, then Save all once." accent="bg-brand-gold"
        right={<Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Pipeline</Link>} />

      {flash && <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ${flash.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>{flash.msg}</div>}

      <Card className="p-4">
        <p className="text-xs text-slate-500">Rename a pipeline or any stage, reorder with ▲▼, add/remove stages, and add whole pipelines — then hit <b>Save all pipelines</b> once. Renaming a stage keeps its deals in place. The &ldquo;War Room&rdquo; pipeline is fixed (it powers the land SOP automations).</p>
        <div className="mt-3">
          <PipelinesEditor initial={pipelines.filter((pp) => pp.name !== "War Room").map((pp) => ({ original: pp.name, name: pp.name, stages: pp.stages.map((st) => ({ key: st.key, label: st.label })), count: plCounts[pp.name] ?? 0, group: crmGroupOf(pp.name, crmMap), sub: dispoKind(pp.name) }))} />
        </div>
      </Card>
    </div>
  );
}
