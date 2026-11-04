"use client";
// 🏷 Friendly lead-type picker (Jon 2026-10-30; land seller split 2026-11-04). Home Seller /
// Land Seller / Developer / Buyer Agent. Developer & Agent switch the PIPELINE
// (setOppPipelineAction) — which swaps the forms + card. Home vs Land sets the lead's
// land/house kind (setLeadKindAction → formData.__leadKind), which drives the card badge and
// the Financials form (land gets the land offer play, home gets underwriting). No separate system.
import { useTransition } from "react";
import { setOppPipelineAction, setLeadKindAction } from "@/app/crm/actions";
import { isDevNetworkName, isAgentNetworkName, DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE } from "@/lib/dispo-buyers";

type LeadType = "seller_home" | "seller_land" | "developer" | "agent";
const TYPES: Array<[LeadType, string]> = [
  ["seller_home", "🏡 Home Seller"],
  ["seller_land", "🏞 Land Seller"],
  ["developer", "🏗 Developer"],
  ["agent", "🧑‍💼 Buyer Agent"],
];

export default function LeadTypePicker({ oppId, pipeline, pipelines = [], leadKind = "" }: { oppId: string; pipeline: string; pipelines?: string[]; leadKind?: "land" | "home" | "" }) {
  const [moving, start] = useTransition();
  const isNetwork = isDevNetworkName(pipeline) || isAgentNetworkName(pipeline);
  const cur: LeadType = isDevNetworkName(pipeline) ? "developer" : isAgentNetworkName(pipeline) ? "agent" : (leadKind === "land" ? "seller_land" : "seller_home");

  // A seller pipeline to land on when coming from a developer/agent pipeline.
  const sellerPipe = () => isNetwork ? (pipelines.find((p) => !isDevNetworkName(p) && !isAgentNetworkName(p)) ?? "War Room") : pipeline;

  const pick = (t: LeadType) => {
    if (t === cur || moving) return;
    const lbl = TYPES.find(([x]) => x === t)![1];
    if (t === "developer" || t === "agent") {
      const target = t === "developer" ? (pipelines.find(isDevNetworkName) ?? DISPO_DEV_PIPELINE) : (pipelines.find(isAgentNetworkName) ?? DISPO_AGENT_PIPELINE);
      if (!target || target === pipeline) return;
      if (!confirm(`Change this lead to ${lbl} and move it to the "${target}" pipeline? Its forms + card will switch to that type.`)) return;
      const fd = new FormData(); fd.set("id", oppId); fd.set("pipeline", target);
      start(async () => { await setOppPipelineAction(fd); window.location.reload(); });
      return;
    }
    // Home / Land seller — set the land/house kind (and move off a network pipeline if needed).
    const kind = t === "seller_land" ? "land" : "home";
    const target = sellerPipe();
    if (!confirm(`Mark this lead as a ${lbl}? Its card + Financials form will switch to ${kind === "land" ? "land" : "home"}.`)) return;
    start(async () => {
      if (target !== pipeline) { const fd = new FormData(); fd.set("id", oppId); fd.set("pipeline", target); await setOppPipelineAction(fd); }
      const fd2 = new FormData(); fd2.set("oppId", oppId); fd2.set("kind", kind); await setLeadKindAction(fd2);
      window.location.reload();
    });
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
      <p className="mt-0.5 text-[10px] text-slate-400">Home/Land switches the card + Financials form. Developer/Agent switches the whole pipeline.</p>
    </div>
  );
}
