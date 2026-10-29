"use client";
// Pipeline mover for the full lead page (/crm/[oppId]). Mirrors the slide-in
// panel's PipelineMover (Nick's ticket 2026-10-15): picking a different pipeline
// reveals THAT pipeline's stages so you choose where the lead lands, then hit
// Move — nothing saves until you do. Lives outside the autosave form so a
// pipeline change can't fire the form's debounced save.
import { useState, useTransition } from "react";
import { setOppPipelineAction } from "@/app/crm/actions";
import { sortPipesAqThenDs } from "@/lib/crm-shared";

type Stage = { key: string; label: string };

export default function OppPipelineMover({ id, pipeline, pipelineNames, pipelineStages, selectCls }: {
  id: string;
  pipeline: string;
  pipelineNames: string[];
  pipelineStages: Record<string, Stage[]>;
  selectCls?: string;
}) {
  const [pendingPipe, setPendingPipe] = useState<string | null>(null);
  const [pendingStage, setPendingStage] = useState<string>("");
  const [moving, startMove] = useTransition();
  const targetStages = pendingPipe ? (pipelineStages[pendingPipe] ?? []) : [];
  const selCls = selectCls ?? "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm";
  const doMove = () => {
    if (!pendingPipe) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("pipeline", pendingPipe);
    if (pendingStage) fd.set("stage", pendingStage);
    startMove(async () => { await setOppPipelineAction(fd); window.location.reload(); });
  };
  return (
    <div className="space-y-1.5">
      <select value={pendingPipe ?? pipeline} className={selCls}
        onChange={(e) => {
          const p = e.target.value;
          if (p === pipeline) { setPendingPipe(null); return; }
          setPendingPipe(p);
          setPendingStage((pipelineStages[p] ?? [])[0]?.key ?? "");
        }}>
        {sortPipesAqThenDs(pipelineNames).map((pn) => <option key={pn} value={pn}>{pn}</option>)}
      </select>
      {pendingPipe && pendingPipe !== pipeline && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 ring-1 ring-amber-200">
          <span className="text-[11px] font-semibold text-amber-800">→ land in:</span>
          <select value={pendingStage} onChange={(e) => setPendingStage(e.target.value)} className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-bold text-slate-700">
            {targetStages.length === 0 && <option value="">(first stage)</option>}
            {targetStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button type="button" onClick={doMove} disabled={moving} className="rounded-md bg-brand-navy px-2.5 py-0.5 text-[11px] font-bold text-white disabled:opacity-50">{moving ? "…" : "Move"}</button>
          <button type="button" onClick={() => setPendingPipe(null)} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">cancel</button>
        </div>
      )}
    </div>
  );
}
