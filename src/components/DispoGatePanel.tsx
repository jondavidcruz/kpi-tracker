"use client";
// 🚦 Option B — the SOP gate for a dispo deal, matched to its ACTUAL current stage
// (Jon 2026-10-21). The path comes from the pipeline (land / cash / novation). Work
// the current stage's gate; the "Advance" button stays locked until every box is
// checked, and moving the deal forward on the board is blocked server-side too.
import { useState, useTransition } from "react";
import { PATH_META, gateForCurrentStage, gateCleared, nextMainStage, isSideStage, pathForPipeline, type Stage } from "@/lib/dispo-gates";
import { toggleDispoGateAction, setOppStageAction } from "@/app/crm/actions";

export default function DispoGatePanel({ oppId, pipeline, currentStage, stages, checks, onChanged, canOverride = false }: {
  oppId: string; pipeline: string; currentStage: string; stages: Stage[]; checks: Record<string, boolean[]>; onChanged?: () => void; canOverride?: boolean;
}) {
  const [, start] = useTransition();
  const [local, setLocal] = useState<Record<string, boolean[]>>(checks);

  const path = pathForPipeline(pipeline);
  const meta = PATH_META[path];
  const curStage = stages.find((s) => s.key === currentStage) ?? null;
  const gate = gateForCurrentStage(path, stages, currentStage);
  const next = nextMainStage(stages, currentStage);
  const cleared = gate ? gateCleared(gate, local) : true;
  const mainStages = stages.filter((s) => !isSideStage(s));
  const curMainIdx = mainStages.findIndex((s) => s.key === currentStage);

  const toggle = (gk: string, i: number, val: boolean) => {
    setLocal((prev) => { const arr = [...(prev[gk] ?? [])]; while (arr.length <= i) arr.push(false); arr[i] = val; return { ...prev, [gk]: arr }; });
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("gateKey", gk); fd.set("idx", String(i)); fd.set("checked", val ? "1" : "0");
    start(() => { toggleDispoGateAction(fd); });
  };
  const advance = (override = false) => {
    if (!next || (!cleared && !override)) return;
    if (override && !confirm(`Move past the gate without clearing it? (manager override — this will be logged)`)) return;
    const fd = new FormData(); fd.set("id", oppId); fd.set("stage", next.key);
    start(async () => { await setOppStageAction(fd); onChanged?.(); });
  };

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">🚦 SOP gate</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{meta.emoji} {meta.label}</span>
      </div>

      {/* stage rail — the deal's real progress */}
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {mainStages.map((s, i) => {
          const isCur = s.key === currentStage;
          const past = curMainIdx >= 0 && i < curMainIdx;
          return (
            <span key={s.key} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${isCur ? "bg-brand-navy text-white" : past ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`} title={s.label}>
              {past ? "✓ " : isCur ? "▸ " : "🔒 "}{s.label.replace(/^[^ ]+ /, "").slice(0, 15)}
            </span>
          );
        })}
      </div>

      {curStage && isSideStage(curStage) ? (
        <p className="py-1 text-[12px] text-slate-500">This is a nurture / side stage — no gate to clear here.</p>
      ) : !gate ? (
        <p className="py-1 text-[12px] text-emerald-600">✅ No gate on this stage — clear to work / close.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-extrabold text-slate-800">{gate.label}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cleared ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{cleared ? "cleared" : "held"}</span>
            <span className="text-[10px] text-slate-400">· gate for <b className="text-slate-500">{curStage?.label}</b></span>
          </div>
          <div className="mt-1.5 space-y-0.5">
            {gate.checks.map((c, i) => {
              const on = !!(local[gate.key] ?? [])[i];
              return (
                <label key={i} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-[12px] leading-snug hover:bg-slate-50">
                  <input type="checkbox" checked={on} onChange={(e) => toggle(gate.key, i, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600" />
                  <span className={on ? "text-slate-400 line-through" : "text-slate-700"}>{c}</span>
                </label>
              );
            })}
          </div>
          {next && (
            <button type="button" onClick={() => advance(false)} disabled={!cleared}
              className={`mt-2 w-full rounded-lg px-3 py-1.5 text-[12px] font-bold ${cleared ? "bg-emerald-600 text-white hover:bg-emerald-700" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}>
              {cleared ? `Advance to ${next.label.replace(/^[^ ]+ /, "")} →` : "🔒 Locked — clear the gate to advance"}
            </button>
          )}
          {/* 👑 Manager override — move past a held gate (e.g. a mis-filed lead), logged (Jon 2026-10-26) */}
          {next && !cleared && canOverride && (
            <button type="button" onClick={() => advance(true)}
              className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100">
              👑 Override — advance to {next.label.replace(/^[^ ]+ /, "")} anyway
            </button>
          )}
        </>
      )}
    </div>
  );
}
