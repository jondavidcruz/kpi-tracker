"use client";
// 🚦 Option B — the SOP gate for a dispo deal, on the deal itself (Jon 2026-10-21).
// Pick the deal type (cash / novation / land), work the current stage's gate, and the
// "Advance" button stays locked until every box is checked. Moving the deal forward on
// the board is blocked server-side until the gate clears — the SOP enforces itself.
import { useState, useTransition } from "react";
import { DEAL_TYPES, GATE_PATHS, forwardStages, gateCleared, type DealType, type Stage } from "@/lib/dispo-gates";
import { setDispoDealTypeAction, toggleDispoGateAction, setOppStageAction } from "@/app/crm/actions";

export default function DispoGatePanel({ oppId, currentStage, stages, dealType, checks, onChanged }: {
  oppId: string; currentStage: string; stages: Stage[]; dealType: DealType; checks: Record<string, boolean[]>; onChanged?: () => void;
}) {
  const [, start] = useTransition();
  const [type, setType] = useState<DealType>(dealType);
  const [local, setLocal] = useState<Record<string, boolean[]>>(checks);

  const fwd = forwardStages(stages);
  const curIdx = fwd.findIndex((s) => s.key === currentStage);
  const path = GATE_PATHS[type];
  const gate = curIdx >= 0 ? path[curIdx] ?? null : null;
  const nextStage = curIdx >= 0 ? fwd[curIdx + 1] ?? null : null;
  const cleared = gate ? gateCleared(gate, local) : true;

  const pickType = (t: DealType) => {
    setType(t);
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("type", t);
    start(async () => { await setDispoDealTypeAction(fd); onChanged?.(); });
  };
  const toggle = (gk: string, i: number, val: boolean) => {
    setLocal((prev) => { const arr = [...(prev[gk] ?? [])]; while (arr.length <= i) arr.push(false); arr[i] = val; return { ...prev, [gk]: arr }; });
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("gateKey", gk); fd.set("idx", String(i)); fd.set("checked", val ? "1" : "0");
    start(() => { toggleDispoGateAction(fd); });
  };
  const advance = () => {
    if (!nextStage || !cleared) return;
    const fd = new FormData(); fd.set("id", oppId); fd.set("stage", nextStage.key);
    start(async () => { await setOppStageAction(fd); onChanged?.(); });
  };

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">🚦 SOP gate — advance is locked until it clears</span>
      </div>

      {/* deal type */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {DEAL_TYPES.map((t) => (
          <button key={t.key} type="button" onClick={() => pickType(t.key)} title={t.blurb}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${type === t.key ? "bg-brand-navy text-white ring-transparent" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* stage rail */}
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {fwd.map((s, i) => {
          const isCur = i === curIdx;
          const past = curIdx >= 0 && i < curIdx;
          return (
            <span key={s.key} className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${isCur ? "bg-brand-navy text-white" : past ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`} title={s.label}>
              {past ? "✓ " : isCur ? "▸ " : i > curIdx ? "🔒 " : ""}{s.label.replace(/^[^ ]+ /, "").slice(0, 16)}
            </span>
          );
        })}
      </div>

      {curIdx < 0 ? (
        <p className="py-1 text-[12px] text-slate-500">This stage isn&apos;t on the forward track (nurture / dead / side) — no gate to clear here.</p>
      ) : !gate ? (
        <p className="py-1 text-[12px] text-emerald-600">✅ Final gated stage cleared — this deal has run the whole path.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-extrabold text-slate-800">{gate.label}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cleared ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{cleared ? "cleared" : "held"}</span>
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
          {nextStage && (
            <button type="button" onClick={advance} disabled={!cleared}
              className={`mt-2 w-full rounded-lg px-3 py-1.5 text-[12px] font-bold ${cleared ? "bg-emerald-600 text-white hover:bg-emerald-700" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}>
              {cleared ? `Advance to ${nextStage.label.replace(/^[^ ]+ /, "")} →` : "🔒 Locked — clear the gate to advance"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
