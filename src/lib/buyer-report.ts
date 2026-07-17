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

  const maxCount = Math.max(1, ...ranked.map((r) => r.count));
  const topPicks = ranked.slice(0, 4);

  // Big top-pick tiles — the exact areas to pull, at a glance.
  const tile = (r: { label: string; count: number; covered: boolean }) => {
    const on = r.covered;
    return `<td width="25%" valign="top" style="padding:4px">
      <div style="background:${on ? "#ecfdf5" : "#fffbeb"};border:1px solid ${on ? "#a7f3d0" : "#fcd34d"};border-radius:12px;padding:12px 8px;text-align:center">
        <div style="font-size:30px;font-weight:800;line-height:1;color:${on ? "#047857" : "#b45309"}">${r.count}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-top:2px">buyers want</div>
        <div style="font-size:14px;font-weight:800;color:#0f172a;margin-top:5px">${esc(r.label)}</div>
        <div style="font-size:9px;font-weight:800;margin-top:3px;color:${on ? "#059669" : "#b45309"}">${on ? "✅ already farming" : "🆕 NEW — pull here"}</div>
      </div></td>`;
  };

  // Horizontal heat bar per area — length = buyer demand, green = farming, amber = NEW.
  const barRow = (r: { label: string; count: number; covered: boolean }) => {
    const pct = Math.max(14, Math.round((r.count / maxCount) * 100));
    const c = r.covered ? "#059669" : "#d97706";
    return `<tr>
      <td width="42%" style="padding:3px 8px 3px 0;font-size:13px;font-weight:700;color:#0f172a;vertical-align:middle">${esc(r.label)}${r.covered ? "" : ` <span style="font-size:9px;font-weight:800;color:#fff;background:#d97706;border-radius:4px;padding:1px 5px">NEW</span>`}</td>
      <td style="vertical-align:middle"><div style="background:#eef2f7;border-radius:5px;height:20px"><div style="background:${c};border-radius:5px;height:20px;width:${pct}%"></div></div></td>
      <td width="30" style="padding:3px 0 3px 8px;text-align:right;font-size:14px;font-weight:800;color:#0f172a;vertical-align:middle">${r.count}</td>
    </tr>`;
  };

  // A clean "baseball card" per developer/buyer — areas as map-pin chips, price + specs as chips.
  const cards = buyers.map((b) => {
    const areas = areasOf(b);
    const areaChips = areas.length
      ? areas.map((a) => `<span style="display:inline-block;background:#0b1f3a;color:#fff;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;margin:3px 4px 0 0">📍 ${esc(a)}</span>`).join("")
      : `<span style="font-size:12px;color:#b91c1c;background:#fef2f2;border-radius:6px;padding:2px 8px">⚠️ no target areas listed — add them so this buyer shows on the map above</span>`;
    const specs = [b.priceRange && `💰 ${b.priceRange}`, b.propertyType, b.buildType, b.dealType, b.minLotSize && `lot ${b.minLotSize}`]
      .map((x) => (x || "").trim()).filter(Boolean)
      .map((x) => `<span style="display:inline-block;background:#f1f5f9;color:#334155;border-radius:6px;padding:2px 8px;font-size:11px;margin:3px 4px 0 0">${esc(x)}</span>`).join("");
    const note = (b.buyBox || "").trim();
    return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:11px 13px;margin:0 0 8px;background:#fff">
      <div style="font-size:15px;font-weight:800;color:#0f172a">${esc(b.name)} <span style="font-size:11px;font-weight:700;color:#4338ca;background:#eef2ff;border-radius:6px;padding:1px 7px;vertical-align:middle">${esc(typeLabel(b.type))}</span>${b.region ? ` <span style="font-size:11px;color:#94a3b8">${esc(b.region)}</span>` : ""}</div>
      <div style="margin-top:4px">${areaChips}</div>
      ${specs ? `<div style="margin-top:4px">${specs}</div>` : ""}
      ${note ? `<div style="margin-top:5px;font-size:11px;color:#94a3b8;font-style:italic">“${esc(note.length > 160 ? note.slice(0, 160) + "…" : note)}”</div>` : ""}
    </div>`;
  }).join("");

  const html = `
  <div style="font-family:system-ui,Arial,sans-serif;color:#0f172a;max-width:720px;margin:0 auto;padding:4px 2px">
    <div style="border-bottom:3px solid #0b1f3a;padding-bottom:8px;margin-bottom:12px">
      <div style="font-weight:800;font-size:19px;color:#0b1f3a">🗺️ Where to pull leads this weekend</div>
      <div style="color:#64748b;font-size:13px">${esc(today)} · from ${buyers.length} vetted buyers' buy boxes${typeMix ? ` (${esc(typeMix)})` : ""}</div>
    </div>

    ${topPicks.length ? `<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#0b1f3a;margin:0 0 4px">🔥 Top areas by buyer demand</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px"><tr>${topPicks.map(tile).join("")}</tr></table>` : ""}

    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#0b1f3a;margin:0 0 6px">📊 Every market, ranked by how many buyers want it</div>
    <div style="font-size:11px;color:#94a3b8;margin:0 0 8px"><span style="display:inline-block;width:10px;height:10px;background:#059669;border-radius:3px;vertical-align:middle"></span> already farming &nbsp;·&nbsp; <span style="display:inline-block;width:10px;height:10px;background:#d97706;border-radius:3px;vertical-align:middle"></span> NEW — buyer demand you're not pulling yet</div>
    ${ranked.length ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${ranked.slice(0, 20).map(barRow).join("")}</table>` : `<p style="font-size:12px;color:#94a3b8">No target areas found in the buy boxes yet — add areas to each buyer on the Vetted Buyers page.</p>`}

    ${newMarkets.length ? `<div style="margin-top:14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:11px 13px">
      <div style="font-size:13px;font-weight:800;color:#92400e">🆕 New markets to add this weekend</div>
      <div style="font-size:12px;color:#92400e;margin-top:3px">You have buyers waiting in <b>${newMarkets.slice(0, 3).map((r) => esc(r.label)).join(", ")}</b>${newMarkets.length > 3 ? ` +${newMarkets.length - 3} more` : ""} but you're not pulling there yet. Start with <b>${esc(newMarkets[0].label)}</b> (${newMarkets[0].count} buyer${newMarkets[0].count === 1 ? "" : "s"} waiting).</div>
    </div>` : `<div style="margin-top:14px;font-size:12px;color:#059669">🎉 Every market your buyers want is already in your Target Markets — no new markets needed this weekend.</div>`}

    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#0b1f3a;margin:20px 0 6px">🏗️ The exact buy boxes</div>
    ${cards}

    <p style="font-size:11px;color:#94a3b8;margin-top:12px">Built from vetted buyers' buy boxes only (JV partners excluded). The areas above come straight from each buyer's target-areas field — if an area looks vague or a buyer shows “no target areas,” tighten it on War Room → Vetted Buyers and next week's map sharpens up.</p>
  </div>`;

  const subject = topPicks.length
    ? `🗺️ Pull leads in ${topPicks[0].label}${topPicks[1] ? ` & ${topPicks[1].label}` : ""}${newMarkets.length ? ` · ${newMarkets.length} new market${newMarkets.length === 1 ? "" : "s"}` : ""} (${today})`
    : `🗺️ Weekend lead-sourcing report (${today})`;
  return { subject, html, buyerCount: buyers.length };
}

/** Build + email the weekly report to Jon. Returns whether it sent. */
export async function sendBuyerBoxReport(today: string, to: string[] = REPORT_TO): Promise<{ sent: boolean; buyerCount: number }> {
  const { subject, html, buyerCount } = await buildBuyerBoxReport(today);
  if (buyerCount === 0) return { sent: false, buyerCount };
  const sent = await sendEmailTo(to, subject, html);
  return { sent, buyerCount };
}
