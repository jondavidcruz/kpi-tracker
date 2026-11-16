"use client";
// ＋ New-lead picker row (Jon 2026-11-16): choose the Pipeline + Stage the lead lands in, its Lead
// type (House / Land), and the Owner. Submits inside the existing New-lead <form> as the fields
// `pipeline`, `stage`, `leadKind`, `assignedTo` — createCrmLeadAction reads them.
import { useState } from "react";

type Pipe = { name: string; stages: { key: string; label: string }[] };
const lbl = "mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400";
const inp = "block w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-800";

export default function NewLeadFields({ pipelines, reps, defaultOwner }: { pipelines: Pipe[]; reps: string[]; defaultOwner: string }) {
  const [pipe, setPipe] = useState(pipelines[0]?.name ?? "");
  const stages = pipelines.find((p) => p.name === pipe)?.stages ?? [];
  // Jon always wants himself selectable as an owner, even though he isn't a "rep" row.
  const owners = [...new Set([...reps, "Jon Cruz"])];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
      <label className="block"><span className={lbl}>Pipeline</span>
        <select name="pipeline" value={pipe} onChange={(e) => setPipe(e.target.value)} className={inp}>
          {pipelines.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      <label className="block"><span className={lbl}>Stage</span>
        {/* keyed by pipe so switching pipeline resets the stage back to the first one */}
        <select key={pipe} name="stage" defaultValue="" className={inp}>
          <option value="">First stage (default)</option>
          {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      <label className="block"><span className={lbl}>Lead type</span>
        <select name="leadKind" defaultValue="" className={inp}>
          <option value="">Auto-detect</option>
          <option value="home">🏡 House</option>
          <option value="land">🏕 Land</option>
        </select>
      </label>
      <label className="block"><span className={lbl}>Assigned to</span>
        <select name="assignedTo" defaultValue={defaultOwner || owners[0]} className={inp}>
          {owners.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
    </div>
  );
}
