"use client";
// 📨 Start/stop an automated follow-up sequence on a lead (Jon 2026-10-29; stage-aware
// 2026-11-04). Enrollment is manual (you pick who + which sequence) OR auto-armed when the
// deal hits a matching stage. Level-2 sequences auto-send; Level-1 drop a ready-to-send task.
// A 👁 preview shows the exact cadence + messages right here, no navigating away (Jon 2026-11-10).
import { useEffect, useState, useTransition } from "react";
import { enrollDripAction, stopDripAction } from "@/app/crm/actions";

type Drip = { seq?: string; step?: number; nextAt?: string; stageArmed?: boolean } | null;
type Step = { channel: "sms" | "email"; delayDays: number; sms?: string; emailSubject?: string; emailBody?: string };
type Seq = { key: string; name: string; autoSend: boolean; steps: Step[] };

// Fallback labels if the sequence fetch fails (drip.ts is server-only — can't import here).
const SEQ_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "seller_land", label: "Seller land — 6 touches / ~30 days" },
  { key: "contract_sent", label: "Contract sent — chase the signature" },
  { key: "offer_negotiate", label: "Offer made / negotiating — keep it warm" },
  { key: "offer_ready", label: "Offer ready — get it in front of them" },
  { key: "ten_days_hell", label: "10 days of hell — intensive close" },
  { key: "ghosted", label: "Ghosted — long re-engagement" },
];

function SeqPreview({ seq }: { seq?: Seq }) {
  if (!seq) return <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-400">Loading sequence…</div>;
  const texts = seq.steps.filter((s) => s.channel === "sms").length;
  const emails = seq.steps.filter((s) => s.channel === "email").length;
  const span = Math.max(0, ...seq.steps.map((s) => s.delayDays));
  return (
    <div className="col-span-2 mt-1 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] shadow-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="font-bold text-slate-700">📱 {texts} text{texts === 1 ? "" : "s"} · 📧 {emails} email{emails === 1 ? "" : "s"} over {span} day{span === 1 ? "" : "s"}</span>
        {seq.autoSend
          ? <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800" title="Level 2 — sends itself on schedule">⚡ auto-sends</span>
          : <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800" title="Level 1 — drops a ready-to-send task">✋ task</span>}
      </div>
      <ol className="space-y-1.5">
        {seq.steps.map((st, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1 py-0.5 font-bold text-slate-500">D{st.delayDays} {st.channel === "sms" ? "📱" : "📧"}</span>
            <span className="min-w-0 leading-snug text-slate-600">
              {st.channel === "email" && <span className="font-bold text-slate-700">{st.emailSubject}: </span>}
              {(st.channel === "sms" ? st.sms : st.emailBody)}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-1.5 text-[10px] text-slate-400">{"{first}"}, {"{address}"}, {"{rep}"} fill in automatically · any reply stops it.</p>
    </div>
  );
}

export default function DripControl({ oppId, contactId, drip, onChanged }: { oppId: string; contactId: string; drip: Drip; onChanged?: () => void }) {
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("seller_land");
  const [seqs, setSeqs] = useState<Seq[]>([]);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    fetch("/api/crm/sequences").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.seqs) setSeqs(j.seqs); }).catch(() => {});
  }, []);
  const options = seqs.length ? seqs.map((s) => ({ key: s.key, label: s.name })) : SEQ_OPTIONS;
  const seqByKey = (key?: string) => seqs.find((s) => s.key === key);
  const seqLabel = (key?: string) => options.find((o) => o.key === key)?.label ?? key ?? "follow-up";
  const run = (fn: (fd: FormData) => Promise<unknown>, seq: string) => {
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("contactId", contactId); fd.set("seq", seq);
    start(async () => { await fn(fd); onChanged?.(); });
  };

  if (drip?.seq) {
    return (
      <>
        <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-lg bg-sky-50/70 px-2.5 py-1.5 text-[12px] ring-1 ring-sky-100">
          <span className="font-bold text-sky-800">📨 {seqLabel(drip.seq)}</span>
          <span className="text-slate-500">step {(drip.step ?? 0) + 1}{drip.nextAt ? ` · next ${drip.nextAt}` : ""}{drip.stageArmed ? " · auto" : ""}</span>
          <button type="button" onClick={() => setPreview((p) => !p)} className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-sky-600 ring-1 ring-sky-200 hover:bg-sky-50" title="See the full cadence + messages">{preview ? "Hide" : "👁 Preview"}</button>
          <button type="button" disabled={pending} onClick={() => run(stopDripAction, drip.seq!)} className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-red-500 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50">{pending ? "…" : "Stop"}</button>
        </div>
        {preview && <SeqPreview seq={seqByKey(drip.seq)} />}
      </>
    );
  }
  return (
    <>
      <div className="col-span-2 flex flex-wrap items-center gap-1.5">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 focus:border-slate-400 focus:outline-none">
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button type="button" onClick={() => setPreview((p) => !p)} className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50" title="See the cadence + exact messages before you start">{preview ? "Hide" : "👁 Preview"}</button>
        <button type="button" disabled={pending} onClick={() => run(enrollDripAction, pick)} className="rounded-lg bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-200 disabled:opacity-50" title="Start this follow-up sequence. Level 2 auto-sends; Level 1 drops a ready-to-send task. Any reply stops it.">{pending ? "Starting…" : "📨 Start sequence"}</button>
      </div>
      {preview && <SeqPreview seq={seqByKey(pick)} />}
    </>
  );
}
