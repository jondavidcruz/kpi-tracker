"use client";
// 🪜 Stage editor (Jon 2026-10-13: rearrange stages, not just pipelines).
// Rows with ▲▼ reorder, inline rename, add/remove. Serializes to a hidden
// textarea named "stages" (one label per line) so savePipelineAction is
// unchanged — stage order = line order.
import { useState } from "react";

export default function StageListEditor({ initial }: { initial: string[] }) {
  const [rows, setRows] = useState<string[]>(initial.length ? initial : [""]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const edit = (i: number, v: string) => setRows(rows.map((r, k) => (k === i ? v : r)));
  const remove = (i: number) => setRows(rows.filter((_, k) => k !== i).length ? rows.filter((_, k) => k !== i) : [""]);
  const add = () => setRows([...rows, ""]);
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="flex flex-col">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move stage up" className="rounded bg-white px-1 text-[9px] leading-tight text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-30">▲</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move stage down" className="rounded bg-white px-1 text-[9px] leading-tight text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-30">▼</button>
          </span>
          <input value={r} onChange={(e) => edit(i, e.target.value)} placeholder={`Stage ${i + 1}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
          <button type="button" onClick={() => remove(i)} title="Remove stage" className="rounded px-1.5 py-1 text-[11px] font-bold text-slate-400 hover:text-red-600">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">＋ add stage</button>
      {/* savePipelineAction reads this: one label per line, in order */}
      <textarea name="stages" readOnly value={rows.map((r) => r.trim()).filter(Boolean).join("\n")} className="hidden" />
    </div>
  );
}
