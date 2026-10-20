"use client";
// 🔴 File a Lien (Jon 2026-10-20): when a seller signs then refuses to close, this
// compiles EVERY documented note / call / text / stage move on the lead into one
// dated "source of truth" timeline — the Memorandum of Contract (Affidavit of
// Interest), reproduced from our real recorded lien (3112 NE 12th St, OKC). It also
// builds the recordable Memorandum of Contract page + a notary acknowledgment, then
// opens a print-ready packet Jon can print, take to get notarized in person, attach
// the signed agreements to, and mail to the county for recording.
import { useMemo, useState } from "react";

type Ev = { id?: string; kind: string; body: string; actor: string; at: string };
type Props = {
  open: boolean;
  onClose: () => void;
  seller: string;
  property: string;
  legal: string;          // legal description (Exhibit A)
  contractDate: string;   // the agreement date
  events: Ev[];
};

const COMPANY = "Freedom Offers LLC, a Wyoming limited liability company";
const SIGNER = "Enrico Cruz";
const CONTACT = "Jon or Rico Cruz at info@freedom-offers.com or 866-721-2119 or 405-449-5610";

const fmtDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function LienBuilder({ open, onClose, seller, property, legal, contractDate, events }: Props) {
  // Auto-compile the documented timeline (oldest → newest) into dated bullets.
  const auto = useMemo(() => {
    const sorted = [...events].filter((e) => e.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const label = (e: Ev) => {
      const b = (e.body || "").replace(/\s+/g, " ").trim();
      if (e.kind === "call") return `we called/attempted contact with the seller — ${b || "outbound call"}`;
      if (e.kind === "sms") return `we ${b.startsWith("⬅") ? "received a text from" : "texted"} the seller — ${b.replace(/^[➡⬅]\s*/, "")}`;
      if (e.kind === "email") return `we emailed the seller — ${b}`;
      if (e.kind === "appt") return b || "an appointment was set with the seller";
      if (e.kind === "stage") return `the deal moved stage — ${b}`;
      return b;
    };
    const lines = sorted.map((e) => `On ${fmtDate(e.at)}, ${label(e)}.`).filter((l) => l.length > 14);
    const calls = sorted.filter((e) => e.kind === "call").length;
    const texts = sorted.filter((e) => e.kind === "sms").length;
    const emails = sorted.filter((e) => e.kind === "email").length;
    const summary = `Across this transaction, Freedom Offers LLC documented ${calls} call${calls === 1 ? "" : "s"}, ${texts} text message${texts === 1 ? "" : "s"}, and ${emails} email${emails === 1 ? "" : "s"} notifying and following up with the seller.`;
    return [`On ${contractDate || "[contract date]"}, Freedom Offers LLC entered into a signed agreement with ${seller || "[seller]"} to purchase the property at ${property || "[property]"}.`, ...lines, summary].join("\n");
  }, [events, seller, property, contractDate]);

  const [reason, setReason] = useState("");
  const [timeline, setTimeline] = useState(auto);
  const [sellerN, setSellerN] = useState(seller);
  const [propertyN, setPropertyN] = useState(property);
  const [legalN, setLegalN] = useState(legal);
  const [cdate, setCdate] = useState(contractDate);
  const [state, setState] = useState("Oklahoma");
  const [county, setCounty] = useState("");

  if (!open) return null;

  const print = () => {
    const bullets = timeline.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join("");
    const reasonBlock = reason.trim()
      ? `<p class="mt"><b>Reason for recording this Memorandum / lien:</b> ${esc(reason.trim())}</p>` : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Memorandum of Contract — ${esc(propertyN)}</title>
<style>
  @page { margin: 1in; }
  body { font-family: 'Times New Roman', Georgia, serif; color:#111; font-size:12pt; line-height:1.5; }
  h1 { text-align:center; font-size:14pt; margin:0 0 2pt; } h2 { text-align:center; font-size:12pt; margin:0 0 18pt; }
  .page { page-break-after: always; } .page:last-child { page-break-after: auto; }
  .mt { margin-top:14pt; } .u { text-decoration:underline; }
  ul { margin-top:6pt; } li { margin-bottom:9pt; }
  .sig { margin-top:40pt; } .line { border-bottom:1px solid #000; display:inline-block; min-width:260px; }
  .small { font-size:10pt; } .center { text-align:center; }
  .note { border:1px solid #999; padding:10pt; margin-top:16pt; font-size:10.5pt; background:#f7f7f7; }
</style></head><body>

<div class="page">
  <h1>MEMORANDUM OF CONTRACT</h1><h2>FOR SALE AND PURCHASE OF PROPERTY</h2>
  <p>This is a Memorandum of that unrecorded Contract for Sale and Purchase of Property ("Contract"), dated <span class="u">${esc(cdate || "____________")}</span>, between <span class="u">${esc(sellerN || "____________")}</span> (hereinafter referred to as "Sellers"), <b>Freedom Offers LLC</b>, a Wyoming limited liability company (hereinafter referred to as "Buyer") and concerning the following real property, <span class="u">${esc(propertyN || "____________")}</span> ("Property") more specifically described in Exhibit "A" attached hereto and made a part hereof by reference.</p>
  <p class="mt">For good and valuable consideration, Seller has agreed to sell, Buyer has agreed to buy, and Buyer Assignee has agreed to buy the Property upon the terms and conditions set forth in the Contract, which terms and conditions are incorporated in this Memorandum by this reference. Except as provided in the Contract from the date hereof, Seller shall not have the right, with respect to the Property to enter into any new contracts, leases or agreements, oral or written, without the prior written consent of Buyer.</p>
  <p class="mt">This Memorandum is not a complete summary of the Contract. Provisions of this Memorandum shall not be used in interpreting the Contract. In the event of conflict between this Memorandum and the Contract, the Contract shall control.</p>
  <p class="mt">IN WITNESS WHEREOF, the said Grantor has caused this deed to be executed by its duly authorized officer on the day and year first above written.</p>
  <div class="sig">
    <p>${esc(COMPANY)}</p>
    <p class="mt"><span class="line"></span><br>${esc(SIGNER)}, Member</p>
    <p class="mt">STATE OF <span class="line"></span></p>
    <p>COUNTY OF <span class="line"></span></p>
    <p class="mt">The foregoing instrument was acknowledged before me on <span class="line"></span> (date) by ${esc(SIGNER)} as Member for Freedom Offers LLC, a Wyoming limited liability company, who is personally known to me, or has produced <span class="line"></span> as identification.</p>
    <p class="mt">SEAL &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span class="line"></span><br><span class="small">(Signature) NOTARY PUBLIC</span></p>
    <p class="small">Print Name: <span class="line"></span><br>My Commission Expires: <span class="line"></span></p>
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
  <div class="note"><b>Before recording:</b> attach the signed Real Estate Purchase &amp; Sale Agreement and any Addendum(s) for this property, get this Memorandum notarized in person (notary acknowledgment / jurat above), then mail or deliver the full packet to the County Clerk for recording.</div>
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
            <div className="text-[12px] text-slate-500">Compiles this seller&apos;s whole timeline into the recordable Affidavit of Interest. Review, add the reason, then print → notarize in person → mail to the county.</div>
          </div>
          <button onClick={onClose} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold text-slate-500">Seller(s)<input value={sellerN} onChange={(e) => setSellerN(e.target.value)} className={fld} /></label>
          <label className="text-[11px] font-bold text-slate-500">Contract date<input value={cdate} onChange={(e) => setCdate(e.target.value)} placeholder="e.g. 9 Feb 2024" className={fld} /></label>
          <label className="col-span-2 text-[11px] font-bold text-slate-500">Property<input value={propertyN} onChange={(e) => setPropertyN(e.target.value)} className={fld} /></label>
          <label className="col-span-2 text-[11px] font-bold text-slate-500">Legal description (Exhibit A)<input value={legalN} onChange={(e) => setLegalN(e.target.value)} placeholder="e.g. Garden Oaks 2nd 004 024" className={fld} /></label>
          <label className="text-[11px] font-bold text-slate-500">Notary — State<input value={state} onChange={(e) => setState(e.target.value)} className={fld} /></label>
          <label className="text-[11px] font-bold text-slate-500">Notary — County<input value={county} onChange={(e) => setCounty(e.target.value)} className={fld} /></label>
        </div>

        <label className="mt-3 block text-[11px] font-bold text-slate-500">Reason for the lien — why they didn&apos;t follow through (X, Y, Z)
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Seller signed the agreement and addendum, then at escrow refused to close and demanded more money…" className={`${fld} mt-0.5`} />
        </label>

        <label className="mt-3 block text-[11px] font-bold text-slate-500">Timeline — auto-compiled from the lead&apos;s notes, calls &amp; texts (edit freely; one event per line)
          <textarea value={timeline} onChange={(e) => setTimeline(e.target.value)} rows={12} className={`${fld} mt-0.5 font-mono text-[12px] leading-relaxed`} />
        </label>

        <div className="mt-4 flex items-center gap-2">
          <button onClick={print} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">🖨 Print lien packet</button>
          <button onClick={() => setTimeline(auto)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">↻ Rebuild timeline</button>
          <span className="text-[11px] text-slate-400">Opens a print-ready Memorandum + Exhibit A + Affidavit of Interest. Attach the signed agreements before recording.</span>
        </div>
      </div>
    </div>
  );
}
