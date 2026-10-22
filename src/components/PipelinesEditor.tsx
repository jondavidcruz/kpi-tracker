"use client";
// 🔀 All-pipelines editor with ONE save (Jon 2026-10-24: "one save button or
// auto-save — don't make me press save for each pipeline"). Edit every pipeline's
// name, stages (reorder / rename / add / remove, keeping each stage's KEY so a
// rename doesn't orphan its deals), reorder pipelines, delete, and add new ones —
// then hit a single sticky "Save all". Serializes the whole thing to one field.
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { saveAllPipelinesAction } from "@/app/crm/actions";
import { stageHelp } from "@/lib/stage-help";

type Stage = { key: string; label: string };
type Pipe = { original: string; name: string; stages: Stage[]; count: number };

function SaveBar({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky top-2 z-20 flex items-center gap-3 rounded-xl bg-slate-900/95 px-4 py-2.5 shadow-lg ring-1 ring-black/10 backdrop-blur">
      <span className="text-xs font-bold text-white">{pending ? "Saving all pipelines…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
      <button disabled={pending} className="ml-auto rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-400 disabled:opacity-50">{pending ? "Saving…" : "💾 Save all pipelines"}</button>
    </div>
  );
}

export default function PipelinesEditor({ initial }: { initial: Pipe[] }) {
  const [pipes, setPipes] = useState<Pipe[]>(initial);
  const [dirty, setDirty] = useState(false);
  const touch = () => setDirty(true);
  const upd = (fn: (ps: Pipe[]) => Pipe[]) => { setPipes((ps) => fn(ps.map((p) => ({ ...p, stages: [...p.stages] })))); touch(); };

  const renamePipe = (i: number, name: string) => upd((ps) => ps.map((p, k) => (k === i ? { ...p, name } : p)));
  const movePipe = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= pipes.length) return; upd((ps) => { const n = [...ps]; [n[i], n[j]] = [n[j], n[i]]; return n; }); };
  const delPipe = (i: number) => { const p = pipes[i]; if (p.count > 0) { alert(`“${p.name}” still has ${p.count} live lead${p.count === 1 ? "" : "s"} — move or archive them first, then delete.`); return; } if (!confirm(`Delete the “${p.name}” pipeline?`)) return; upd((ps) => ps.filter((_, k) => k !== i)); };
  const addPipe = () => upd((ps) => [...ps, { original: "", name: "", stages: [{ key: "", label: "New Lead" }, { key: "", label: "Contacted" }, { key: "", label: "Won" }], count: 0 }]);

  const setStage = (pi: number, si: number, label: string) => upd((ps) => ps.map((p, k) => (k === pi ? { ...p, stages: p.stages.map((s, j) => (j === si ? { ...s, label } : s)) } : p)));
  const moveStage = (pi: number, si: number, d: -1 | 1) => { const j = si + d; upd((ps) => ps.map((p, k) => { if (k !== pi || j < 0 || j >= p.stages.length) return p; const n = [...p.stages]; [n[si], n[j]] = [n[j], n[si]]; return { ...p, stages: n }; })); };
  const delStage = (pi: number, si: number) => upd((ps) => ps.map((p, k) => (k === pi ? { ...p, stages: p.stages.filter((_, j) => j !== si).length ? p.stages.filter((_, j) => j !== si) : [{ key: "", label: "" }] } : p)));
  const addStage = (pi: number) => upd((ps) => ps.map((p, k) => (k === pi ? { ...p, stages: [...p.stages, { key: "", label: "" }] } : p)));

  const payload = JSON.stringify(pipes.map((p) => ({ original: p.original, name: p.name, stages: p.stages.map((s) => ({ key: s.key, label: s.label.trim() })).filter((s) => s.label) })));

  return (
    <form action={saveAllPipelinesAction} className="space-y-3">
      <input type="hidden" name="payload" value={payload} />
      <SaveBar dirty={dirty} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {pipes.map((p, pi) => (
          <div key={pi} className="space-y-1.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => movePipe(pi, -1)} disabled={pi === 0} title="Move pipeline up" className="rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-30">▲</button>
              <button type="button" onClick={() => movePipe(pi, 1)} disabled={pi === pipes.length - 1} title="Move pipeline down" className="rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-30">▼</button>
              <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">drag order</span>
              <span className="ml-auto text-[10px] text-slate-400">{p.count} leads</span>
              <button type="button" onClick={() => delPipe(pi)} className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500 hover:text-red-600" title={p.count > 0 ? "Has live leads — can't delete yet" : "Delete pipeline"}>🗑</button>
            </div>
            <input value={p.name} onChange={(e) => renamePipe(pi, e.target.value)} placeholder="Pipeline name" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold" />
            <div className="space-y-1">
              {p.stages.map((s, si) => (
                <div key={si} className="flex items-center gap-1">
                  <span className="flex flex-col">
                    <button type="button" onClick={() => moveStage(pi, si, -1)} disabled={si === 0} className="rounded bg-white px-1 text-[9px] leading-tight text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => moveStage(pi, si, 1)} disabled={si === p.stages.length - 1} className="rounded bg-white px-1 text-[9px] leading-tight text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-30">▼</button>
                  </span>
                  <input value={s.label} onChange={(e) => setStage(pi, si, e.target.value)} placeholder={`Stage ${si + 1}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                  {(() => { const h = stageHelp(s.label); return h ? (
                    <span className="group/sh relative">
                      <span className="grid h-4 w-4 cursor-help place-items-center rounded-full bg-slate-100 text-[9px] font-extrabold text-slate-400 ring-1 ring-slate-200 hover:text-slate-600">i</span>
                      <span className="pointer-events-none absolute right-0 top-5 z-50 hidden w-60 rounded-xl bg-slate-900 p-2.5 text-left text-white shadow-xl group-hover/sh:block">
                        <span className="block text-[11px] font-extrabold">{h.title}</span>
                        <span className="mt-0.5 block text-[10px] font-medium leading-snug text-slate-200">{h.desc}</span>
                      </span>
                    </span>
                  ) : null; })()}
                  <button type="button" onClick={() => delStage(pi, si)} title="Remove stage" className="rounded px-1.5 py-1 text-[11px] font-bold text-slate-400 hover:text-red-600">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => addStage(pi)} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">＋ add stage</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addPipe} className="flex min-h-[120px] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-3 text-xs font-bold text-slate-400 hover:border-emerald-400 hover:text-emerald-600">＋ Add a new pipeline</button>
      </div>
      <SaveBar dirty={dirty} />
    </form>
  );
}
