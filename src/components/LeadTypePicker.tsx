"use client";
// 🏷 Friendly lead-type picker (Jon 2026-10-30): Seller / Developer / Buyer Agent. It drives the
// EXISTING pipeline move (setOppPipelineAction) with clear labels instead of raw pipeline names —
// switching the lead's pipeline also switches the forms + card it generates. No separate system.
import { useTransition } from "react";
import { setOppPipelineAction } from "@/app/crm/actions";
import { isDevNetworkName, isAgentNetworkName, DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE } from "@/lib/dispo-buyers";

type LeadType = "seller" | "developer" | "agent";
const TYPES: Array<[LeadType, string]> = [["seller", "🏡 Seller"], ["developer", "🏗 Developer"], ["agent", "🧑‍💼 Buyer Agent"]];

export default function LeadTypePicker({ oppId, pipeline, pipelines = [] }: { oppId: string; pipeline: string; pipelines?: string[] }) {
  const [moving, start] = useTransition();
  const cur: LeadType = isDevNetworkName(pipeline) ? "developer" : isAgentNetworkName(pipeline) ? "agent" : "seller";

  const resolve = (t: LeadType): string => {
    if (t === "developer") return pipelines.find(isDevNetworkName) ?? DISPO_DEV_PIPELINE;
    if (t === "agent") return pipelines.find(isAgentNetworkName) ?? DISPO_AGENT_PIPELINE;
    // seller → keep the current pipeline if it's already a seller one, else the first non-network pipeline
    if (cur === "seller") return pipeline;
    return pipelines.find((p) => !isDevNetworkName(p) && !isAgentNetworkName(p)) ?? "War Room";
  };

  const pick = (t: LeadType) => {
    if (t === cur || moving) return;
    const target = resolve(t);
    if (!target || target === pipeline) return;
    const lbl = TYPES.find(([x]) => x === t)![1];
    if (!confirm(`Change this lead to ${lbl} and move it to the "${target}" pipeline? Its forms + card will switch to that type.`)) return;
    const fd = new FormData(); fd.set("id", oppId); fd.set("pipeline", target);
    start(async () => { await setOppPipelineAction(fd); window.location.reload(); });
  };

  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">🏷 Lead type</div>
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map(([t, lbl]) => (
          <button key={t} type="button" disabled={moving} onClick={() => pick(t)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ring-1 transition disabled:opacity-50 ${cur === t ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>{lbl}</button>
        ))}
      </div>
      <p className="mt-0.5 text-[10px] text-slate-400">Switches the pipeline + the card/forms this lead generates.</p>
    </div>
  );
}
