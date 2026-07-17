import { db } from "./db";
import { sendEmailTo } from "./notify";

// Weekly "where should I pull leads?" report — analyzes ONLY our vetted buyers' buy boxes,
// ranks the markets by how many vetted buyers want deals there, and (by cross-checking the
// Target Markets we already farm) flags NEW markets with buyer demand we're not yet pulling.

const REPORT_TO = ["jon@freedom-offers.com"];

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const TYPE_LABEL: Record<string, string> = { developer: "Developer", custom: "Custom builder", remodeler: "Remodeler", flipper: "Fix & Flipper", cash_buyer: "Cash buyer", investor: "Investor", agent: "Agent", other: "Buyer" };
const typeLabel = (t: string) => TYPE_LABEL[t] || (t ? t.replace(/_/g, " ") : "Buyer");

type Buyer = { name: string; type: string; region: string; market: string; buyBox: string; buyBoxAreas: string; priceRange: string; dealType: string; buildType: string; propertyType: string };

// Pull the distinct target-areas out of a buyer's buy box (areas list + their city/market).
function areasOf(b: Buyer): string[] {
  const raw = [b.buyBoxAreas, b.market].filter(Boolean).join("\n");
  return Array.from(new Set(raw.split(/[\n,;/|]+/).map((x) => x.trim()).filter((x) => x.length > 1)));
}

export async function buildBuyerBoxReport(today: string): Promise<{ subject: string; html: string; buyerCount: number }> {
  const [rows, targets] = await Promise.all([
    db.marketContact.findMany({
      where: { vetStage: { in: ["vetted", "active"] }, type: { not: "jv_partner" } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { name: true, type: true, region: true, market: true, buyBox: true, buyBoxAreas: true, priceRange: true, dealType: true, buildType: true, propertyType: true },
    }),
    db.targetMarket.findMany({ select: { name: true } }),
  ]);
  const buyers = rows as Buyer[];

  // Demand map: normalized area → the vetted buyers who want deals there.
  const demand = new Map<string, { label: string; buyers: { name: string; type: string }[] }>();
  for (const b of buyers) {
    for (const a of areasOf(b)) {
      const key = norm(a);
      if (!key) continue;
      const e = demand.get(key) ?? { label: a, buyers: [] };
      if (!e.buyers.some((x) => x.name === b.name)) e.buyers.push({ name: b.name, type: b.type });
      demand.set(key, e);
    }
  }
  const targetNorms = targets.map((t) => norm(t.name)).filter(Boolean);
  const covered = (key: string) => targetNorms.some((tn) => tn.includes(key) || key.includes(tn) || key.split(" ").some((w) => w.length > 3 && tn.includes(w)));
  const ranked = [...demand.values()]
    .map((e) => ({ label: e.label, count: e.buyers.length, buyers: e.buyers, covered: covered(norm(e.label)) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const newMarkets = ranked.filter((r) => !r.covered);
  const pullNow = ranked.filter((r) => r.covered);

  // Buyer-type mix.
  const typeCount: Record<string, number> = {};
  for (const b of buyers) typeCount[b.type || "other"] = (typeCount[b.type || "other"] || 0) + 1;
  const typeMix = Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${typeLabel(t)}${n === 1 ? "" : "s"}`).join(" · ");

  const chip = (r: { label: string; count: number; buyers: { name: string; type: string }[] }, bg: string, bd: string, tc: string) =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #eef2f7"><b style="color:#0f172a">${esc(r.label)}</b></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eef2f7;text-align:center"><span style="display:inline-block;min-width:22px;background:${bg};border:1px solid ${bd};color:${tc};border-radius:999px;padding:1px 8px;font-weight:800">${r.count}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eef2f7;color:#475569;font-size:12px">${r.buyers.map((x) => `${esc(x.name.split(" ")[0])} <span style="color:#94a3b8">(${esc(typeLabel(x.type))})</span>`).join(" · ")}</td></tr>`;

  const rosterRows = buyers.map((b) => {
    const areas = areasOf(b).join(", ") || (b.region || "—");
    const box = [b.priceRange, b.buyBox, b.propertyType, b.dealType, b.buildType].map((x) => (x || "").trim()).filter(Boolean).join(" · ");
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9"><b>${esc(b.name)}</b><br><span style="font-size:11px;color:#64748b">${esc(typeLabel(b.type))}${b.region ? ` · ${esc(b.region)}` : ""}</span></td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155">${esc(areas)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569">${box ? esc(box) : "<span style='color:#94a3b8'>—</span>"}</td></tr>`;
  }).join("");

  const html = `
  <div style="font-family:system-ui,Arial,sans-serif;color:#0f172a;max-width:720px;margin:0 auto;padding:4px 2px">
    <div style="border-bottom:3px solid #0b1f3a;padding-bottom:8px;margin-bottom:12px">
      <div style="font-weight:800;font-size:18px;color:#0b1f3a">🎯 Vetted-Buyer Buy-Box & Lead-Sourcing Report</div>
      <div style="color:#64748b;font-size:13px">${esc(today)} · Friday end-of-shift · pull leads over the weekend where the demand is</div>
    </div>

    <p style="font-size:13px;color:#334155;margin:0 0 12px"><b>${buyers.length}</b> vetted buyers on the board${typeMix ? ` — ${esc(typeMix)}` : ""}. Ranked below by how many of them want deals in each market (buy boxes only).</p>

    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#047857;margin:6px 0 4px">✅ Pull leads here — markets you already farm, by buyer demand</div>
    ${pullNow.length ? `<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px">
      <tr style="background:#f8fafc"><th style="text-align:left;padding:6px 10px;color:#64748b;font-size:11px">Market</th><th style="padding:6px 10px;color:#64748b;font-size:11px"># buyers</th><th style="text-align:left;padding:6px 10px;color:#64748b;font-size:11px">Who wants it</th></tr>
      ${pullNow.slice(0, 25).map((r) => chip(r, "#ecfdf5", "#a7f3d0", "#047857")).join("")}
    </table>` : `<p style="font-size:12px;color:#94a3b8;margin:2px 0 10px">No buyer-demand areas match your current Target Markets yet.</p>`}

    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#b45309;margin:16px 0 4px">🆕 NEW markets to consider this weekend — buyers want these, but they're NOT in your Target Markets</div>
    ${newMarkets.length ? `<table style="width:100%;border-collapse:collapse;border:1px solid #fde68a;border-radius:8px;overflow:hidden;font-size:13px">
      <tr style="background:#fffbeb"><th style="text-align:left;padding:6px 10px;color:#92400e;font-size:11px">Market</th><th style="padding:6px 10px;color:#92400e;font-size:11px"># buyers</th><th style="text-align:left;padding:6px 10px;color:#92400e;font-size:11px">Who wants it</th></tr>
      ${newMarkets.slice(0, 25).map((r) => chip(r, "#fffbeb", "#fcd34d", "#b45309")).join("")}
    </table>
    <p style="font-size:12px;color:#92400e;margin:6px 0 0">👉 <b>Weekend call:</b> the top of this list is where you have buyer demand but aren't pulling leads. Adding ${esc(newMarkets[0].label)}${newMarkets[1] ? ` and ${esc(newMarkets[1].label)}` : ""} to your pull would give existing buyers more to look at.</p>` : `<p style="font-size:12px;color:#94a3b8;margin:2px 0 10px">🎉 Every market your buyers want is already in your Target Markets — no new markets needed this weekend.</p>`}

    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#475569;margin:18px 0 4px">👥 Buyer roster & buy boxes (vetted only)</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:12px">
      <tr style="background:#f8fafc"><th style="text-align:left;padding:6px 10px;color:#64748b;font-size:11px">Buyer</th><th style="text-align:left;padding:6px 10px;color:#64748b;font-size:11px">Target areas</th><th style="text-align:left;padding:6px 10px;color:#64748b;font-size:11px">Buy box</th></tr>
      ${rosterRows}
    </table>

    <p style="font-size:11px;color:#94a3b8;margin-top:14px">Auto-generated from vetted buyers' buy boxes only (JV partners excluded). Update buy boxes on the War Room → Vetted Buyers page to sharpen this report.</p>
  </div>`;

  const subject = `🎯 Weekend lead-sourcing — ${buyers.length} vetted buyers${newMarkets.length ? ` · ${newMarkets.length} new market${newMarkets.length === 1 ? "" : "s"} to consider` : ""} (${today})`;
  return { subject, html, buyerCount: buyers.length };
}

/** Build + email the weekly report to Jon. Returns whether it sent. */
export async function sendBuyerBoxReport(today: string, to: string[] = REPORT_TO): Promise<{ sent: boolean; buyerCount: number }> {
  const { subject, html, buyerCount } = await buildBuyerBoxReport(today);
  if (buyerCount === 0) return { sent: false, buyerCount };
  const sent = await sendEmailTo(to, subject, html);
  return { sent, buyerCount };
}
