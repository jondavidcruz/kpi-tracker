// 📄 Buyer-safe property details sheet → print to PDF (Jon 2026-10-26). A standalone HTML
// document (route handler, no app shell) so Marie opens it for a deal and prints straight to a
// PDF to attach to the offer packet. Shows ONLY property/land characteristics + features —
// every field marked `sensitive` (seller motivation, their price, offers, urgency…) is left
// out, and there is NO asking price.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { CRM_FORMS } from "@/lib/crm-forms";
import { formatAddress } from "@/lib/address";

export const dynamic = "force-dynamic";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(_req: Request, { params }: { params: Promise<{ oppId: string }> }) {
  const { oppId } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(new URL("/login", _req.url));
  if (!(isManager(me) || ["dispositions", "acquisitions", "cc_lm"].includes(me.position ?? ""))) return NextResponse.redirect(new URL("/", _req.url));

  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { title: true, formData: true, contact: { select: { address: true } } } });
  if (!opp) return new NextResponse("Deal not found", { status: 404 });

  const fd = (opp.formData ?? {}) as Record<string, Record<string, string | string[]>>;
  const address = formatAddress(opp.title) || (opp.contact?.address ? formatAddress(opp.contact.address) : "") || "Address on request";
  const apn = fd.property?.apn || fd.land?.apn || "";

  const sections = CRM_FORMS.map((form) => {
    const rows = form.fields
      .filter((f) => !f.sensitive && f.key !== "address" && f.key !== "apn")
      .map((f) => ({ label: f.label.replace(/\s*\([^)]*\)\s*$/, ""), value: fd[form.key]?.[f.key] }))
      .filter((r) => r.value && (Array.isArray(r.value) ? r.value.length : String(r.value).trim()));
    return { name: form.name, emoji: form.emoji, rows };
  }).filter((s) => s.rows.length > 0);

  const sectionsHtml = sections.length === 0
    ? `<p style="color:#94a3b8;font-size:13px">No property details captured yet — fill in the Home / Land details on the deal, then re-open this sheet.</p>`
    : sections.map((s) => `
      <div class="sec">
        <h2>${esc(s.emoji)} ${esc(s.name)}</h2>
        <table><tbody>
          ${s.rows.map((r) => `<tr><td class="k">${esc(r.label)}</td><td>${
            Array.isArray(r.value)
              ? `<div class="chips">${r.value.map((v) => `<span class="chip">${esc(v)}</span>`).join("")}</div>`
              : esc(r.value)
          }</td></tr>`).join("")}
        </tbody></table>
      </div>`).join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Property Details — ${esc(address)}</title>
<style>
  :root { --navy:#0b1f3a; --gold:#c9a227; --slate:#475569; --light:#94a3b8; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#0f172a; background:#f1f5f9; }
  .wrap { max-width:820px; margin:0 auto; padding:24px 16px 60px; }
  .bar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
  .bar a { font-size:13px; font-weight:700; color:#475569; text-decoration:none; }
  .btn { border:0; cursor:pointer; background:var(--navy); color:#fff; padding:9px 16px; border-radius:10px; font-size:14px; font-weight:700; }
  .sheet { background:#fff; border-radius:14px; box-shadow:0 10px 30px -18px rgba(15,23,42,.3); overflow:hidden; }
  .cover { background:var(--navy); color:#fff; padding:28px 28px 24px; border-bottom:4px solid var(--gold); }
  .brand { font-size:12px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--gold); }
  .addr { font-size:24px; font-weight:800; margin:8px 0 2px; }
  .apn { font-size:12px; color:#cbd5e1; }
  .body { padding:22px 28px 28px; }
  .sec { margin-bottom:20px; }
  .sec h2 { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.6px; color:var(--navy); border-bottom:2px solid #e2e8f0; padding-bottom:6px; margin:0 0 10px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:7px 8px; vertical-align:top; font-size:13px; border-bottom:1px solid #f1f5f9; }
  td.k { width:210px; font-weight:700; color:var(--slate); }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; border-radius:999px; padding:3px 10px; font-size:12px; font-weight:700; }
  .foot { padding:16px 28px 24px; border-top:1px solid #e2e8f0; color:var(--slate); font-size:12px; }
  .foot b { color:var(--navy); }
  @media print { body { background:#fff; } .no-print { display:none !important; } .wrap { padding:0; max-width:none; } .sheet { box-shadow:none; border-radius:0; } }
</style></head>
<body>
  <div class="wrap">
    <div class="bar no-print">
      <a href="/crm/${esc(oppId)}">← Back to the deal</a>
      <button class="btn" onclick="window.print()">🖨 Save as PDF / Print</button>
    </div>
    <div class="sheet">
      <div class="cover">
        <div class="brand">Freedom Offers · Off-Market Opportunity</div>
        <div class="addr">${esc(address)}</div>
        ${apn ? `<div class="apn">APN ${esc(apn)}</div>` : ""}
      </div>
      <div class="body">${sectionsHtml}</div>
      <div class="foot">
        <b>Interested?</b> Contact Freedom Offers for pricing and to make an offer. · freedom-offers.com · 1-877-652-8991
        <div style="margin-top:6px;color:#94a3b8">Details believed accurate but not guaranteed — buyer to verify all information and complete their own due diligence.</div>
      </div>
    </div>
  </div>
</body></html>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
