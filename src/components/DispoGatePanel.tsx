"use client";
// 🚦 Option B — the SOP gate for a dispo deal, matched to its ACTUAL current stage
// (Jon 2026-10-21). The path comes from the pipeline (land / cash / novation). Work
// the current stage's gate; the "Advance" button stays locked until every box is
// checked, and moving the deal forward on the board is blocked server-side too.
import { useState, useTransition } from "react";
import { PATH_META, gateForCurrentStage, gateCleared, nextMainStage, isSideStage, isMarketingGate, pathForPipeline, type Stage } from "@/lib/dispo-gates";
import { marketingComplete, OWNER_LABEL, type MarketingStep } from "@/lib/dispo-marketing";
import { toggleDispoGateAction, setOppStageAction } from "@/app/crm/actions";

export default function DispoGatePanel({ oppId, pipeline, currentStage, stages, checks, onChanged, canOverride = false, marketingSteps = [], marketingDone = [] }: {
  oppId: string; pipeline: string; currentStage: string; stages: Stage[]; checks: Record<string, boolean[]>; onChanged?: () => void; canOverride?: boolean;
  marketingSteps?: MarketingStep[]; marketingDone?: string[];
}) {
  const [, start] = useTransition();
  const [local, setLocal] = useState<Record<string, boolean[]>>(checks);

  const path = pathForPipeline(pipeline);
  const meta = PATH_META[path];
  const curStage = stages.find((s) => s.key === currentStage) ?? null;
  const gate = gateForCurrentStage(path, stages, currentStage);
  const next = nextMainStage(stages, currentStage);
  // The "sent to buyers" gate mirrors the Marketing checklist — it's cleared only when every
  // channel is done (Jon 2026-10-29). Other gates use their own checkboxes.
  const mktDone = marketingComplete(marketingSteps, marketingDone);
  const cleared = gate ? gateCleared(gate, local, mktDone) : true;
  const doneSet = new Set(marketingDone);
  const mktRemaining = marketingSteps.filter((s) => !doneSet.has(s.key)).length;
  const mainStages = stages.filter((s) => !isSideStage(s));
  const curMainIdx = mainStages.findIndex((s) => s.key === currentStage);

  const toggle = (gk: string, i: number, val: boolean) => {
    setLocal((prev) => { const arr = [...(prev[gk] ?? [])]; while (arr.length <= i) arr.push(false); arr[i] = val; return { ...prev, [gk]: arr }; });
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("gateKey", gk); fd.set("idx", String(i)); fd.set("checked", val ? "1" : "0");
    start(() => { toggleDispoGateAction(fd); });
  };
  const advance = () => {
    if (!next) return;
    // 🚦 Nag, don't block (Jon 2026-10-29): anyone can advance; if the gate isn't complete,
    // remind them first, then let them move.
    if (!cleared && !confirm(`⚠️ The SOP gate “${gate?.label ?? "checklist"}” isn't marked complete.\n\nDid you finish the checklist? Advance anyway?`)) return;
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
          {isMarketingGate(gate) ? (
            /* 📣 This gate mirrors the Marketing checklist (Jon 2026-10-29): no separate duplicate
               list — it clears only when every active + passive channel below is done. */
            <div className="mt-1.5">
              <p className="mb-1 text-[11px] text-slate-500">
                This gate <b>mirrors the 📣 Marketing checklist</b> — it clears only when every channel is done.{" "}
                {marketingSteps.length === 0 ? "" : mktRemaining === 0
                  ? <span className="font-bold text-emerald-600">All {marketingSteps.length} channels done ✓</span>
                  : <span className="font-bold text-amber-700">{marketingDone.length}/{marketingSteps.length} done — {mktRemaining} channel{mktRemaining === 1 ? "" : "s"} left.</span>}
              </p>
              {marketingSteps.length === 0 ? (
                <p className="text-[11px] text-slate-400">Open the deal&apos;s Marketing checklist to work the channels.</p>
              ) : (
                <div className="space-y-0.5">
                  {marketingSteps.map((s) => {
                    const on = doneSet.has(s.key);
                    return (
                      <div key={s.key} className="flex items-start gap-2 rounded px-1 py-0.5 text-[12px] leading-snug">
                        <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-[10px] font-bold ${on ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-300 ring-1 ring-slate-200"}`}>{on ? "✓" : ""}</span>
                        <span className={on ? "text-slate-400 line-through" : "text-slate-700"}>{s.label} <span className="text-[10px] font-semibold text-slate-400">· {OWNER_LABEL[s.owner]} · {s.group === "active" ? "📞 active" : "📣 passive"}</span></span>
                      </div>
                    );
                  })}
                  <p className="mt-1 text-[10px] text-slate-400">Check these off on the <b>📣 Marketing checklist</b> panel — they update here automatically.</p>
                </div>
              )}
            </div>
          ) : (
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
          )}
          {next && (
            <button type="button" onClick={advance}
              className={`mt-2 w-full rounded-lg px-3 py-1.5 text-[12px] font-bold ${cleared ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"}`}>
              {cleared ? `Advance to ${next.label.replace(/^[^ ]+ /, "")} →` : `⚠️ Gate not complete — advance to ${next.label.replace(/^[^ ]+ /, "")} anyway?`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
