"use client";
// 🏷 Friendly lead-type picker (Jon 2026-10-30; land-seller split 2026-11-04). Home Seller /
// Land Seller / Developer / Buyer Agent.
//   • Home vs Land ONLY sets the lead's land/house flag (setLeadKindAction → formData.__leadKind)
//     and soft-refreshes IN PLACE. It never moves the pipeline and never reloads — so it can't
//     lose notes or jump you to a new screen (Jon 2026-11-04: switching deleted notes + navigated).
//   • Developer / Buyer Agent genuinely switch the PIPELINE (that's a different kind of lead),
//     which swaps the forms + card.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOppPipelineAction, setLeadKindAction } from "@/app/crm/actions";
import { isDevNetworkName, isAgentNetworkName, DISPO_DEV_PIPELINE, DISPO_AGENT_PIPELINE } from "@/lib/dispo-buyers";

type LeadType = "seller_home" | "seller_land" | "developer" | "agent";
const TYPES: Array<[LeadType, string]> = [
  ["seller_home", "🏡 Home Seller"],
  ["seller_land", "🏞 Land Seller"],
  ["developer", "🏗 Developer"],
  ["agent", "🧑‍💼 Buyer Agent"],
];

export default function LeadTypePicker({ oppId, pipeline, pipelines = [], leadKind = "", onChanged }: { oppId: string; pipeline: string; pipelines?: string[]; leadKind?: "land" | "home" | ""; onChanged?: () => void }) {
  const [moving, start] = useTransition();
  const router = useRouter();
  const cur: LeadType = isDevNetworkName(pipeline) ? "developer" : isAgentNetworkName(pipeline) ? "agent" : (leadKind === "land" ? "seller_land" : "seller_home");

  const pick = (t: LeadType) => {
    if (t === cur || moving) return;
    const lbl = TYPES.find(([x]) => x === t)![1];
    // 🏡/🏞 Seller home vs land: flag only, in place. No pipeline move, no reload, no data touched.
    if (t === "seller_home" || t === "seller_land") {
      const kind = t === "seller_land" ? "land" : "home";
      const fd = new FormData(); fd.set("oppId", oppId); fd.set("kind", kind);
      start(async () => { await setLeadKindAction(fd); onChanged?.(); router.refresh(); });
      return;
    }
    // 🏗/🧑‍💼 Developer / Buyer Agent: real pipeline switch.
    const target = t === "developer" ? (pipelines.find(isDevNetworkName) ?? DISPO_DEV_PIPELINE) : (pipelines.find(isAgentNetworkName) ?? DISPO_AGENT_PIPELINE);
    if (!target || target === pipeline) return;
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
      <p className="mt-0.5 text-[10px] text-slate-400">Home/Land just switches the card + Financials form — nothing else changes. Developer/Agent switches the whole pipeline.</p>
    </div>
  );
}
