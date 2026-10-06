"use client";
// Phase 8: the 📦 Packet tab on a deal — APNs in, draft offering packet out.
// Shows progress, the 🟡 TO BE VERIFIED checklist with inline inputs, the
// version list, and Approve (the approved version is what the cascade sends).
import { useState, useTransition } from "react";
import { generatePacketAction, approvePacketAction } from "@/app/actions";

export type PacketRow = {
  id: string; version: number; url: string; htmlUrl: string; createdAt: string;
  generatedBy: string; approvedAt: string | null; approvedBy: string;
  toVerify: string[]; warnings: string[];
};

const MANUAL: Array<[string, string]> = [
  ["utilitiesWater", "Water (county/city/well?)"],
  ["utilitiesSewer", "Sewer / septic"],
  ["electric", "Electric at street"],
  ["setbacks", "Setbacks / buildable"],
  ["species", "Listed species"],
];

export default function PacketPanel({ dealId, packets, canApprove }: { dealId: string; packets: PacketRow[]; canApprove: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string; version?: number; url?: string; htmlUrl?: string; packetId?: string; warnings?: string[]; changed?: string[] } | null>(null);
  const [showManual, setShowManual] = useState(false);

  const generate = (fd: FormData) => {
    fd.set("dealId", dealId);
    start(async () => setResult(await generatePacketAction(fd)));
  };

  const latest = packets[0];
  return (
    <div className="space-y-2 text-xs">
      <form action={generate} className="space-y-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">APNs (comma or space separated)</span>
            <input name="apns" placeholder="402116252014, 402116252015, …" className="w-full rounded-md border border-slate-200 px-2 py-1.5" required />
          </label>
          <label className="w-14"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">State</span>
            <input name="state" placeholder="FL" maxLength={2} className="w-full rounded-md border border-slate-200 px-2 py-1.5 uppercase" required /></label>
          <label className="w-32"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">County</span>
            <input name="county" placeholder="Charlotte" className="w-full rounded-md border border-slate-200 px-2 py-1.5" required /></label>
          <label className="w-52"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Deal status (sets the wording)</span>
            <select name="engagement" className="w-full rounded-md border border-slate-200 px-2 py-1.5">
              <option value="contract">✓ Under contract — escrow opened</option>
              <option value="seller">◷ Working with the seller (pre-contract)</option>
            </select></label>
          <button disabled={pending} className="rounded-md bg-brand-navy px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-50">
            {pending ? "⏳ Pulling Regrid · FEMA · Wetlands · Soils…" : latest ? "↻ Regenerate draft" : "📦 Generate draft"}
          </button>
        </div>
        <button type="button" onClick={() => setShowManual((v) => !v)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">
          {showManual ? "▴ hide" : "▾ fill the 🟡 items"} (water · sewer · electric · setbacks · species)
        </button>
        <details className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-[11px] font-bold text-slate-600">🧭 If the auto-pull fails — manual sources (pull these yourself, then paste into the 🟡 items)</summary>
          <div className="mt-1.5 grid grid-cols-1 gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
            <span>🗺 <b>Parcel / building envelope:</b> <a href="https://app.regrid.com" target="_blank" className="font-bold text-sky-700 underline">app.regrid.com</a> — search the APN, screenshot the boundary</span>
            <span>🌊 <b>FEMA flood zone:</b> <a href="https://msc.fema.gov/portal/search" target="_blank" className="font-bold text-sky-700 underline">msc.fema.gov</a> — address search → print map</span>
            <span>💧 <b>Wetlands:</b> <a href="https://www.fws.gov/program/national-wetlands-inventory/wetlands-mapper" target="_blank" className="font-bold text-sky-700 underline">NWI Wetlands Mapper</a> — zoom to parcel</span>
            <span>🌱 <b>Soils:</b> <a href="https://websoilsurvey.nrcs.usda.gov/app/WebSoilSurvey.aspx" target="_blank" className="font-bold text-sky-700 underline">USDA Web Soil Survey</a> — draw AOI → soil report</span>
            <span>⛰ <b>Elevation / slope:</b> <a href="https://apps.nationalmap.gov/viewer/" target="_blank" className="font-bold text-sky-700 underline">USGS National Map</a></span>
            <span>☎️ <b>Water / sewer / electric / setbacks:</b> call county planning &amp; utilities — number prints on the packet</span>
          </div>
        </details>
        {showManual && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MANUAL.map(([k, label]) => (
              <label key={k}><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
                <input name={k} className="w-full rounded-md border border-slate-200 px-2 py-1.5" /></label>
            ))}
            <label className="col-span-2 sm:col-span-3"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Notes for the packet</span>
              <input name="notes" className="w-full rounded-md border border-slate-200 px-2 py-1.5" /></label>
          </div>
        )}
      </form>

      {result && (
        <div className={`rounded-lg p-2 ring-1 ${result.ok ? "bg-emerald-50 ring-emerald-200" : "bg-red-50 ring-red-200"}`}>
          {result.ok ? (
            <div className="space-y-1">
              <div className="font-bold text-emerald-800">✅ Draft v{result.version} generated</div>
              <div className="flex flex-wrap gap-2">
                {result.url && <a href={result.url} target="_blank" className="rounded-md bg-emerald-600 px-2 py-1 font-bold text-white">⬇ PDF</a>}
                {result.packetId && <a href={`/api/packet/view/${result.packetId}`} target="_blank" className="rounded-md bg-slate-700 px-2 py-1 font-bold text-white">🖨 View / print</a>}
              </div>
              {!!result.changed?.length && <div className="text-emerald-700">Changed vs v{(result.version ?? 1) - 1}: {result.changed.join(" · ")}</div>}
              {!!result.warnings?.length && (
                <ul className="list-inside list-disc text-amber-700">{result.warnings.slice(0, 6).map((w, i) => <li key={i}>🟡 {w}</li>)}</ul>
              )}
            </div>
          ) : <div className="font-bold text-red-700">{result.error}</div>}
        </div>
      )}

      {packets.length > 0 && (
        <div className="space-y-1">
          {packets.map((pk) => (
            <div key={pk.id} className={`flex flex-wrap items-center gap-2 rounded-lg p-1.5 ring-1 ${pk.approvedAt ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
              <span className="font-bold text-slate-800">v{pk.version}</span>
              <span className="text-slate-400">{new Date(pk.createdAt).toLocaleDateString()} · {pk.generatedBy || "webhook"}</span>
              {pk.approvedAt
                ? <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">✅ APPROVED{pk.approvedBy ? ` · ${pk.approvedBy.split(" ")[0]}` : ""} — cascade sends this</span>
                : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">draft</span>}
              {!!pk.toVerify?.length && <span className="text-amber-600">🟡 {pk.toVerify.join(" · ")}</span>}
              <span className="ml-auto flex items-center gap-1.5">
                {pk.url && <a href={pk.url} target="_blank" className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-600 hover:bg-slate-200">PDF</a>}
                <a href={`/api/packet/view/${pk.id}`} target="_blank" className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-600 hover:bg-slate-200">🖨 View / print</a>
                {pk.url && <button onClick={() => navigator.clipboard.writeText(pk.url).catch(() => {})} className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-600 hover:bg-slate-200">📋 link</button>}
                {canApprove && !pk.approvedAt && (
                  <form action={approvePacketAction}><input type="hidden" name="packetId" value={pk.id} />
                    <button className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700">Approve</button></form>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
