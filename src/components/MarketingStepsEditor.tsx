"use client";
// 📣 Edit the marketing checklist steps yourself (Jon 2026-10-26: "some of these are outdated").
// Add / edit / remove / reorder the active (outreach) + passive (posting) steps, grouped by
// owner. Saves to the team's config — no code change needed. Keys stay stable on edit so a
// deal's "done" checkmarks don't reset when you rename a step.
import { useState } from "react";
import { saveMarketingStepsAction } from "@/app/crm/actions";
import type { MarketingStep, MarketingOwner } from "@/lib/dispo-marketing";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || `step_${Math.random().toString(36).slice(2, 7)}`;

export default function MarketingStepsEditor({ initial }: { initial: MarketingStep[] }) {
  const [steps, setSteps] = useState<MarketingStep[]>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [pending, setPending] = useState(false);

  const save = async (next: MarketingStep[]) => {
    setStatus("saving"); setPending(true);
    const fd = new FormData();
    fd.set("steps", JSON.stringify(next));
    await saveMarketingStepsAction(fd);
    setStatus("saved"); setPending(false);
  };
  const commit = (next: MarketingStep[]) => { setSteps(next); void save(next); };

  const update = (i: number, patch: Partial<MarketingStep>) => { const next = steps.map((s, j) => (j === i ? { ...s, ...patch } : s)); setSteps(next); };
  const updateCommit = (i: number, patch: Partial<MarketingStep>) => commit(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => commit(steps.filter((_, j) => j !== i));
  const addStep = (group: "active" | "passive", owner: MarketingOwner) => {
    const key = `custom_${Math.random().toString(36).slice(2, 8)}`;
    commit([...steps, { key, label: "New step", group, owner }]);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps]; [next[i], next[j]] = [next[j], next[i]]; commit(next);
  };

  const groups: { group: "active" | "passive"; owner: MarketingOwner; label: string }[] = [
    { group: "active", owner: "sharyn", label: "📞 Active outreach — Sharyn (calls / emails / texts)" },
    { group: "passive", owner: "marie", label: "📰 Posting & listing — Marie (the platforms)" },
  ];

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.group}>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-slate-800">{g.label}</h2>
            <button onClick={() => addStep(g.group, g.owner)} disabled={pending} className="ml-auto rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">＋ Add step</button>
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => s.group === g.group ? (
              <div key={s.key} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <div className="flex items-center gap-2">
                  <span className="flex flex-col leading-none">
                    <button onClick={() => move(i, -1)} className="text-[10px] text-slate-400 hover:text-brand-navy">▲</button>
                    <button onClick={() => move(i, 1)} className="text-[10px] text-slate-400 hover:text-brand-navy">▼</button>
                  </span>
                  <input value={s.label} onChange={(e) => update(i, { label: e.target.value })} onBlur={() => updateCommit(i, {})} placeholder="Step label" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold" />
                  <button onClick={() => remove(i)} disabled={pending} className="rounded px-1.5 py-1 text-xs text-slate-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" title="Remove step">🗑</button>
                </div>
                <input value={s.hint ?? ""} onChange={(e) => update(i, { hint: e.target.value })} onBlur={() => updateCommit(i, {})} placeholder="Optional hint / how-to (shown under the step)" className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] text-slate-500" />
              </div>
            ) : null)}
            {steps.filter((s) => s.group === g.group).length === 0 && <p className="text-xs text-slate-400">No steps yet — add one above.</p>}
          </div>
        </div>
      ))}
      <div className="h-4 text-xs font-semibold">
        {status === "saving" && <span className="text-sky-500">saving…</span>}
        {status === "saved" && <span className="text-emerald-600">✓ saved — live on every deal now</span>}
      </div>
    </div>
  );
}
