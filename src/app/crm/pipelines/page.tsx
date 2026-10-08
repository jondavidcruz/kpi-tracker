import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { readPipelines } from "@/lib/crm";
import { savePipelineAction } from "../actions";

export const dynamic = "force-dynamic";

// 🔀 Pipelines — rename anything, add stages & whole pipelines, in its own room.
export default async function CrmPipelinesPage() {
  const me = await getCurrentUser();
  if (!me || !canAccessCSuite(me)) return <Card className="p-10 text-center text-slate-400">🔒 System Settings — C-suite only.</Card>;
  const pipelines = await readPipelines();
  const counts = await db.crmOpportunity.groupBy({ by: ["pipeline"], where: { archivedAt: null }, _count: { _all: true } });
  const plCounts: Record<string, number> = {};
  for (const c of counts) plCounts[c.pipeline || "War Room"] = c._count._all;

  return (
    <div className="space-y-4">
      <SectionTitle title="🔀 Pipelines" subtitle="Rename anything, re-order stages (one per line, top to bottom), create your own pipelines." accent="bg-brand-gold"
        right={<Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Pipeline</Link>} />

      <Card className="p-4">
        <p className="text-xs text-slate-500">Renaming a stage moves its column; leads in a removed stage show in the first column until you drag them. The &ldquo;War Room&rdquo; pipeline&apos;s stages are fixed (they power the land SOP automations).</p>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {pipelines.filter((pp) => pp.name !== "War Room").map((pp) => (
            <form key={pp.name} action={savePipelineAction} className="space-y-1.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <input type="hidden" name="original" value={pp.name} />
              <input name="name" defaultValue={pp.name} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold" />
              <textarea name="stages" rows={6} defaultValue={pp.stages.map((st) => st.label).join("\n")} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
              <span className="flex gap-2">
                <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">Save</button>
                <button name="del" value="1" className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-red-600" title="Only deletes when the pipeline has no live leads">🗑 delete</button>
                <span className="ml-auto self-center text-[10px] text-slate-400">{(plCounts[pp.name] ?? 0)} leads</span>
              </span>
            </form>
          ))}
          <form action={savePipelineAction} className="space-y-1.5 rounded-xl border-2 border-dashed border-slate-200 p-3">
            <input type="hidden" name="original" value="" />
            <input name="name" required placeholder="＋ New pipeline name" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold" />
            <textarea name="stages" rows={6} required placeholder={"New Lead\nContacted\nOffer Made\nWon"} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
            <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Create pipeline</button>
          </form>
        </div>
      </Card>
    </div>
  );
}
