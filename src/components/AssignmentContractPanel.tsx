"use client";
// 📄 Assignment contract auto-draft (Jon 2026-10-22). Once offers are in and the
// best one is handed to the seller, this drafts the Assignment of Purchase & Sale
// Agreement straight from the deal's numbers — seller-contract price + our fee —
// so the girls don't retype anything. Fields are editable; Generate rebuilds the
// contract server-side and stores it on the deal. Copy / download / print; the
// "send for signature" path is explained (we don't auto-send).
import { useState } from "react";
import { saveAssignmentDraftAction, sendAssignmentForSignatureAction, textSigningLinkAction } from "@/app/crm/actions";
import { money, assigneeAllIn, type AssignmentDraft } from "@/lib/assignment-contract";

type Defaults = {
  assignorEntity: string; assignorSigner: string;
  assigneeName: string; assigneeEntity: string; assigneeEmail: string;
  propertyAddress: string; apn: string; county: string; state: string; acres: string;
  purchasePrice: number; assignmentFee: number; emd: number;
  closingDays: number; titleCompany: string; effectiveDate: string;
};

export default function AssignmentContractPanel({ oppId, defaults, draft, pandadocReady = false, canSms = false, assigneePhone = "" }: { oppId: string; defaults: Defaults; draft: AssignmentDraft | null; pandadocReady?: boolean; canSms?: boolean; assigneePhone?: string }) {
  const [open, setOpen] = useState(false);
  const base = draft ?? defaults;
  const [purchase, setPurchase] = useState(String(base.purchasePrice || ""));
  const [fee, setFee] = useState(String(base.assignmentFee || ""));
  const [copied, setCopied] = useState(false);
  const pp = Number(purchase.replace(/[$,\s]/g, "")) || 0;
  const ff = Number(fee.replace(/[$,\s]/g, "")) || 0;
  const allIn = assigneeAllIn({ purchasePrice: pp, assignmentFee: ff });

  const copy = async () => {
    if (!draft?.text) return;
    try { await navigator.clipboard.writeText(draft.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const download = () => {
    if (!draft?.text) return;
    const blob = new Blob([draft.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = (draft.propertyAddress || "assignment").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40).toLowerCase();
    a.href = url; a.download = `assignment-${slug || "contract"}.txt`; a.click();
    URL.revokeObjectURL(url);
  };
  const print = () => {
    if (!draft?.text) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<pre style="font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;padding:32px;max-width:720px;margin:auto">${draft.text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] || c))}</pre>`);
    w.document.close(); w.focus(); w.print();
  };

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">📄 Assignment contract</span>
        {draft ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">✓ drafted</span>
               : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">auto-draft from this deal</span>}
        <span className="ml-auto text-slate-300">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <form action={saveAssignmentDraftAction} className="space-y-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-100">
            <input type="hidden" name="oppId" value={oppId} />
            {/* money row — the heart of it, prefilled from the deal */}
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[10px] font-bold text-slate-500">Purchase price (to seller)
                <input name="purchasePrice" value={purchase} onChange={(e) => setPurchase(e.target.value)} placeholder="$" className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-[12px] font-bold text-slate-800" />
              </label>
              <label className="text-[10px] font-bold text-emerald-600">Our assignment fee
                <input name="assignmentFee" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="$" className="mt-0.5 w-full rounded border border-emerald-300 px-1.5 py-1 text-[12px] font-extrabold text-emerald-700" />
              </label>
            </div>
            <div className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800 ring-1 ring-indigo-100">
              Assignee pays all-in <b>{money(allIn)}</b> = {money(pp)} to seller + {money(ff)} fee to us
            </div>
            {/* assignee */}
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[10px] font-bold text-slate-500">Assignee (end buyer)
                <input name="assigneeName" defaultValue={base.assigneeName} placeholder="Buyer name" className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
              </label>
              <label className="text-[10px] font-bold text-slate-500">Assignee entity
                <input name="assigneeEntity" defaultValue={base.assigneeEntity} placeholder="LLC / entity" className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
              </label>
            </div>
            <label className="block text-[10px] font-bold text-slate-500">Assignee email
              <input name="assigneeEmail" defaultValue={base.assigneeEmail} placeholder="buyer@email.com" className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
            </label>
            {/* property */}
            <label className="block text-[10px] font-bold text-slate-500">Property address
              <input name="propertyAddress" defaultValue={base.propertyAddress} className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              <label className="text-[10px] font-bold text-slate-500">APN
                <input name="apn" defaultValue={base.apn} className="mt-0.5 w-full rounded border border-slate-300 px-1 py-1 text-[11px]" />
              </label>
              <label className="text-[10px] font-bold text-slate-500">County
                <input name="county" defaultValue={base.county} className="mt-0.5 w-full rounded border border-slate-300 px-1 py-1 text-[11px]" />
              </label>
              <label className="text-[10px] font-bold text-slate-500">State
                <input name="state" defaultValue={base.state} className="mt-0.5 w-full rounded border border-slate-300 px-1 py-1 text-[11px]" />
              </label>
              <label className="text-[10px] font-bold text-slate-500">Acres
                <input name="acres" defaultValue={base.acres} className="mt-0.5 w-full rounded border border-slate-300 px-1 py-1 text-[11px]" />
              </label>
            </div>
            {/* terms */}
            <div className="grid grid-cols-3 gap-1.5">
              <label className="text-[10px] font-bold text-slate-500">Deposit (EMD)
                <input name="emd" defaultValue={base.emd || ""} placeholder="$" className="mt-0.5 w-full rounded border border-slate-300 px-1 py-1 text-[11px]" />
              </label>
              <label className="text-[10px] font-bold text-slate-500">Close in (days)
                <input name="closingDays" defaultValue={base.closingDays || 30} inputMode="numeric" className="mt-0.5 w-full rounded border border-slate-300 px-1 py-1 text-[11px]" />
              </label>
              <label className="text-[10px] font-bold text-slate-500">Effective date
                <input name="effectiveDate" type="date" defaultValue={base.effectiveDate} className="mt-0.5 w-full rounded border border-slate-300 px-1 py-1 text-[11px]" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[10px] font-bold text-slate-500">Title / closing company
                <input name="titleCompany" defaultValue={base.titleCompany} placeholder="Title company" className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
              </label>
              <label className="text-[10px] font-bold text-slate-500">Our signer
                <input name="assignorSigner" defaultValue={base.assignorSigner} placeholder="Who signs for us" className="mt-0.5 w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
              </label>
            </div>
            <input type="hidden" name="assignorEntity" value={base.assignorEntity || "Freedom Offers LLC"} />
            <button className="w-full rounded-lg bg-brand-navy px-3 py-2 text-[12px] font-extrabold text-white hover:bg-brand-navy-700">
              {draft ? "♻️ Regenerate contract" : "📄 Generate assignment contract"}
            </button>
          </form>

          {draft?.text && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={copy} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200">{copied ? "✓ Copied" : "📋 Copy"}</button>
                <button onClick={download} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200">⬇️ Download .txt</button>
                <button onClick={print} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200">🖨 Print / PDF</button>
                {draft.generatedAt && <span className="ml-auto text-[10px] text-slate-400">drafted {new Date(draft.generatedAt).toLocaleDateString()}{draft.generatedBy ? ` · ${draft.generatedBy}` : ""}</span>}
              </div>
              <pre className="max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-[10.5px] leading-relaxed text-slate-100 whitespace-pre-wrap">{draft.text}</pre>
              <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800 ring-1 ring-amber-200">
                ⚠️ Draft for internal use + attorney review — not legal advice. We never auto-send; you send it below.
              </div>

              {/* 🖊 Send for signature — PandaDoc engine + Telnyx SMS / PandaDoc email (Jon's pick) */}
              <div className="rounded-lg bg-indigo-50 p-2 ring-1 ring-indigo-200">
                <div className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-500">🖊 Send for signature</div>
                {draft.sentAt && (
                  <div className="mt-1 rounded bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">✓ Sent via PandaDoc {new Date(draft.sentAt).toLocaleDateString()}{draft.shareLink ? " — link ready to text below" : ""}</div>
                )}
                {/* A) PandaDoc email send (vendor's warm IPs = inbox-safe) */}
                <form action={sendAssignmentForSignatureAction} className="mt-1.5">
                  <input type="hidden" name="oppId" value={oppId} />
                  <button className="w-full rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700" title="PandaDoc drafts + emails the assignee from its own trusted servers">📧 Draft + email via PandaDoc {draft.sentAt ? "(resend)" : ""}</button>
                </form>
                {!pandadocReady && (
                  <div className="mt-1 text-[10px] text-indigo-700">
                    One-time switch-on: set <code className="rounded bg-white px-1">PANDADOC_DRAFTING=1</code> + <code className="rounded bg-white px-1">PANDADOC_TEMPLATE_ASSIGNMENT</code> (your PandaDoc assignment template). Until then, make the doc in PandaDoc and paste its signing link below.
                  </div>
                )}
                {/* B) Telnyx SMS the signing link — works today with any link */}
                <form action={textSigningLinkAction} className="mt-2 space-y-1 border-t border-indigo-100 pt-2">
                  <input type="hidden" name="oppId" value={oppId} />
                  <input type="hidden" name="name" value={base.assigneeName} />
                  <div className="text-[10px] font-bold text-indigo-500">📲 Text the signing link (inbox-proof)</div>
                  <input name="link" defaultValue={draft.shareLink || ""} placeholder="Paste PandaDoc signing link…" className="w-full rounded border border-indigo-200 px-1.5 py-1 text-[11px]" />
                  <div className="flex gap-1">
                    <input name="phone" defaultValue={assigneePhone} placeholder="Buyer's mobile #" className="min-w-0 flex-1 rounded border border-indigo-200 px-1.5 py-1 text-[11px]" />
                    <button disabled={!canSms} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-40" title={canSms ? "Text the link via Telnyx" : "SMS not enabled for your account"}>Send SMS</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
