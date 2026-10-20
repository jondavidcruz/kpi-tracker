"use client";
// 🔴 File a Lien (Jon 2026-10-20): when a seller signs then refuses to close, this
// generates the recordable Memorandum of Contract + an AI-cleaned, SELLER-ONLY
// Affidavit of Interest timeline, and lists the lead's signed agreements to attach.
// No notary block — Jon brings it to a notary in person and they add their own
// acknowledgment. Signer is the person filing (defaults to the current user).
import { useEffect, useMemo, useState } from "react";

type Ev = { id?: string; kind: string; body: string; actor: string; at: string };
type Doc = { label: string; url: string };
type Props = {
  open: boolean;
  onClose: () => void;
  seller: string;
  property: string;
  legal: string;          // legal description (Exhibit A)
  contractDate: string;   // the agreement date
  signer: string;         // who signs the Memorandum (the current user)
  events: Ev[];
  documents: Doc[];       // signed agreements on the lead (uploads / PandaDoc)
};

const COMPANY = "Freedom Offers LLC, a Wyoming limited liability company";
const CONTACT = "Jon or Rico Cruz at info@freedom-offers.com or 866-721-2119 or 405-449-5610";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function LienBuilder({ open, onClose, seller, property, legal, contractDate, signer, events, documents }: Props) {
  const [reason, setReason] = useState("");
  const [timeline, setTimeline] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [sellerN, setSellerN] = useState(seller);
  const [propertyN, setPropertyN] = useState(property);
  const [legalN, setLegalN] = useState(legal);
  const [cdate, setCdate] = useState(contractDate);
  const [signerN, setSignerN] = useState(signer);

  // Pull a clean, seller-only timeline from the AI endpoint when the modal opens.
  const buildTimeline = useMemo(() => async () => {
    setCleaning(true);
    try {
      const r = await fetch("/api/lien-timeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events, seller: sellerN, property: propertyN, contractDate: cdate }) });
      if (r.ok) { const j = await r.json(); setTimeline(j.timeline || ""); }
    } catch { /* keep whatever's there */ }
    setCleaning(false);
  }, [events, sellerN, propertyN, cdate]);

  useEffect(() => { if (open && !timeline) buildTimeline(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const print = () => {
    const bullets = timeline.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join("");
    const reasonBlock = reason.trim()
      ? `<p class="mt"><b>Reason for recording this Memorandum / lien:</b> ${esc(reason.trim())}</p>` : "";
    const docList = documents.length
      ? `<div class="note"><b>Attached agreements (signed):</b><ul>${documents.map((d) => `<li>${esc(d.label)}</li>`).join("")}</ul>Attach the signed agreement(s) above to this Memorandum before recording.</div>`
      : `<div class="note"><b>Before recording:</b> attach the signed Real Estate Purchase &amp; Sale Agreement and any Addendum(s) for this property.</div>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Memorandum of Contract — ${esc(propertyN)}</title>
<style>
  @page { margin: 1in; }
  body { font-family: 'Times New Roman', Georgia, serif; color:#111; font-size:12pt; line-height:1.5; }
  h1 { text-align:center; font-size:14pt; margin:0 0 2pt; } h2 { text-align:center; font-size:12pt; margin:0 0 18pt; }
  .page { page-break-after: always; } .page:last-child { page-break-after: auto; }
  .mt { margin-top:14pt; } .u { text-decoration:underline; }
  ul { margin-top:6pt; } li { margin-bottom:9pt; }
  .sig { margin-top:48pt; } .line { border-bottom:1px solid #000; display:inline-block; min-width:280px; }
  .center { text-align:center; }
  .note { border:1px solid #999; padding:10pt; margin-top:16pt; font-size:10.5pt; background:#f7f7f7; }
  .note ul { margin:6pt 0 4pt; } .note li { margin-bottom:3pt; }
</style></head><body>

<div class="page">
  <h1>MEMORANDUM OF CONTRACT</h1><h2>FOR SALE AND PURCHASE OF PROPERTY</h2>
  <p>This is a Memorandum of that unrecorded Contract for Sale and Purchase of Property ("Contract"), dated <span class="u">${esc(cdate || "____________")}</span>, between <span class="u">${esc(sellerN || "____________")}</span> (hereinafter referred to as "Sellers"), <b>Freedom Offers LLC</b>, a Wyoming limited liability company (hereinafter referred to as "Buyer") and concerning the following real property, <span class="u">${esc(propertyN || "____________")}</span> ("Property") more specifically described in Exhibit "A" attached hereto and made a part hereof by reference.</p>
  <p class="mt">For good and valuable consideration, Seller has agreed to sell, Buyer has agreed to buy, and Buyer Assignee has agreed to buy the Property upon the terms and conditions set forth in the Contract, which terms and conditions are incorporated in this Memorandum by this reference. Except as provided in the Contract from the date hereof, Seller shall not have the right, with respect to the Property to enter into any new contracts, leases or agreements, oral or written, without the prior written consent of Buyer.</p>
  <p class="mt">This Memorandum is not a complete summary of the Contract. Provisions of this Memorandum shall not be used in interpreting the Contract. In the event of conflict between this Memorandum and the Contract, the Contract shall control.</p>
  <p class="mt">IN WITNESS WHEREOF, the said Grantor has caused this instrument to be executed by its duly authorized officer on the day and year first above written.</p>
  <div class="sig">
    <p>${esc(COMPANY)}</p>
    <p class="mt"><span class="line"></span><br>${esc(signerN || "____________")}, Member</p>
  </div>
</div>

<div class="page">
  <h1 class="mt">Exhibit "A"</h1><h2>Legal Description</h2>
  <p class="center u">${esc(legalN || "[legal description]")}</p>
</div>

<div class="page">
  <h1>Memorandum of Contract (Affidavit of Interest)</h1>
  ${reasonBlock}
  <ul>${bullets}</ul>
  <p class="mt">Contact ${esc(CONTACT)} for any questions regarding this matter or memorandum.</p>
  ${docList}
</div>

</body></html>`;
    const w = window.open("", "_blank", "width=880,height=1000");
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  const fld = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm";
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xl">🔴</span>
          <div className="flex-1">
            <div className="text-base font-extrabold text-slate-900">File a Lien — Memorandum of Contract</div>
            <div className="text-[12px] text-slate-500">Generates the recordable Memorandum + an AI-cleaned, seller-only timeline. Print → notarize in person → mail to the county.</div>
          </div>
          <button onClick={onClose} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold text-slate-500">Seller(s)<input value={sellerN} onChange={(e) => setSellerN(e.target.value)} className={fld} /></label>
          <label className="text-[11px] font-bold text-slate-500">Contract date<input value={cdate} onChange={(e) => setCdate(e.target.value)} placeholder="e.g. 9 Feb 2024" className={fld} /></label>
          <label className="col-span-2 text-[11px] font-bold text-slate-500">Property<input value={propertyN} onChange={(e) => setPropertyN(e.target.value)} className={fld} /></label>
          <label className="col-span-2 text-[11px] font-bold text-slate-500">Legal description (Exhibit A)<input value={legalN} onChange={(e) => setLegalN(e.target.value)} placeholder="e.g. Garden Oaks 2nd 004 024" className={fld} /></label>
          <label className="col-span-2 text-[11px] font-bold text-slate-500">Signed by (Member)<input value={signerN} onChange={(e) => setSignerN(e.target.value)} className={fld} /></label>
        </div>

        <label className="mt-3 block text-[11px] font-bold text-slate-500">Reason for the lien — why they didn&apos;t follow through (X, Y, Z)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Seller signed the agreement and addendum, then at escrow refused to close and demanded more money…" className={`${fld} mt-0.5`} />
        </label>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500">Timeline — AI-cleaned to seller-only events (edit freely; one event per line)</span>
          <button onClick={buildTimeline} disabled={cleaning} className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100 disabled:opacity-50">{cleaning ? "✨ Cleaning…" : "✨ Clean with AI"}</button>
        </div>
        <textarea value={timeline} onChange={(e) => setTimeline(e.target.value)} rows={12} placeholder={cleaning ? "Compiling the seller timeline…" : ""} className={`${fld} mt-1 font-mono text-[12px] leading-relaxed`} />

        {documents.length > 0 && (
          <div className="mt-3 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
            <div className="mb-1 text-[11px] font-bold text-slate-500">📎 Signed agreements on this lead — printed list attaches to the packet</div>
            <div className="flex flex-wrap gap-1.5">
              {documents.map((d, i) => (
                <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50">📄 {d.label}</a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button onClick={print} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">🖨 Print lien packet</button>
          <span className="text-[11px] text-slate-400">Opens a print-ready Memorandum + Exhibit A + Affidavit of Interest. The notary adds their own acknowledgment in person.</span>
        </div>
      </div>
    </div>
  );
}
