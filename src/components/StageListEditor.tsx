"use client";
// 🪜 Stage editor (Jon 2026-10-13: rearrange stages, not just pipelines).
// Rows with ▲▼ reorder, inline rename, add/remove. Each row keeps its original
// stage KEY so renaming a stage DOESN'T re-key the deals in it — the #1 cause of
// deals orphaning into the first column (Jon 2026-10-24). Serializes to a hidden
// `stagesJson` field of [{key,label}] (and a plain `stages` textarea for fallback).
import { useState } from "react";
import { stageHelp } from "@/lib/stage-help";

type Row = { key: string; label: string };
export default function StageListEditor({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ key: "", label: "" }]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const edit = (i: number, v: string) => setRows(rows.map((r, k) => (k === i ? { ...r, label: v } : r)));
  const remove = (i: number) => setRows(rows.filter((_, k) => k !== i).length ? rows.filter((_, k) => k !== i) : [{ key: "", label: "" }]);
  const add = () => setRows([...rows, { key: "", label: "" }]);
  const clean = rows.map((r) => ({ key: r.key, label: r.label.trim() })).filter((r) => r.label);
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="flex flex-col">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move stage up" className="rounded bg-white px-1 text-[9px] leading-tight text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-30">▲</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move stage down" className="rounded bg-white px-1 text-[9px] leading-tight text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-30">▼</button>
          </span>
          <input value={r.label} onChange={(e) => edit(i, e.target.value)} placeholder={`Stage ${i + 1}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
          {(() => { const h = stageHelp(r.label); return h ? (
            <span className="group/sh relative">
              <span className="grid h-4 w-4 cursor-help place-items-center rounded-full bg-slate-100 text-[9px] font-extrabold text-slate-400 ring-1 ring-slate-200 hover:text-slate-600">i</span>
              <span className="pointer-events-none absolute right-0 top-5 z-50 hidden w-60 rounded-xl bg-slate-900 p-2.5 text-left text-white shadow-xl group-hover/sh:block">
                <span className="block text-[11px] font-extrabold">{h.title}</span>
                <span className="mt-0.5 block text-[10px] font-medium leading-snug text-slate-200">{h.desc}</span>
              </span>
            </span>
          ) : null; })()}
          <button type="button" onClick={() => remove(i)} title="Remove stage" className="rounded px-1.5 py-1 text-[11px] font-bold text-slate-400 hover:text-red-600">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">＋ add stage</button>
      {/* savePipelineAction prefers stagesJson (keeps each stage's KEY so renames don't
          re-key the deals); the plain `stages` lines stay as a fallback. */}
      <textarea name="stagesJson" readOnly value={JSON.stringify(clean)} className="hidden" />
      <textarea name="stages" readOnly value={clean.map((r) => r.label).join("\n")} className="hidden" />
    </div>
  );
}
