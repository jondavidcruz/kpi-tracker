// Phase 8: renders a PacketModel to the print-ready offering-packet HTML —
// Jon's Port Charlotte template: navy cover, gold rules, stat tiles, Offering
// Summary & Terms, Site & Due Diligence Summary (status pills), Attached
// Documentation index, then Tab A parcel maps · Tab B FEMA · Tab C wetlands ·
// Tab D soils. NO asking price anywhere (buyers call for pricing).
import type { PacketModel } from "./types";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const NAVY = "#0b1f3a", GOLD = "#c9a227", SLATE = "#475569", LIGHT = "#94a3b8";

const pill = (ok: boolean | null, text: string) =>
  `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;${
    ok === true ? "background:#ecfdf5;color:#047857" : ok === false ? "background:#fef2f2;color:#b91c1c" : "background:#fefce8;color:#a16207"
  }">${esc(text)}</span>`;

const tbv = () => pill(null, "🟡 TO BE VERIFIED");

export function renderPacketHtml(m: PacketModel): string {
  const p0 = m.parcels[0];
  const acresTotal = m.totals.acres != null ? `${m.totals.acres.toFixed(2)} ac` : "—";
  const floodZones = [...new Set(m.parcels.map((p) => p.flood?.zone).filter(Boolean))].join(", ") || "—";
  const wetMax = Math.max(-1, ...m.parcels.map((p) => p.wetlands?.pctOfParcel ?? -1));
  const tile = (label: string, value: string) =>
    `<td style="width:25%;padding:0 5px"><div style="border:1px solid #e2e8f0;border-top:3px solid ${GOLD};border-radius:10px;padding:14px 10px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:${NAVY}">${esc(value)}</div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${LIGHT};margin-top:3px">${esc(label)}</div></div></td>`;

  const schedule = m.parcels.map((p, i) => `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"}">
    <td style="padding:7px 9px;font-weight:700;color:${NAVY}">${esc(p.parcel.apn)}</td>
    <td style="padding:7px 9px">${esc(p.parcel.address || "—")}</td>
    <td style="padding:7px 9px;text-align:right">${p.parcel.acres != null ? p.parcel.acres.toFixed(2) : "—"}</td>
    <td style="padding:7px 9px">${esc(p.parcel.zoning || "—")}</td>
    <td style="padding:7px 9px">${esc(p.flood?.zone || "—")}${p.flood?.bfe ? ` / BFE ${esc(p.flood.bfe)}` : ""}</td>
    <td style="padding:7px 9px">${p.wetlands ? (p.wetlands.pctOfParcel != null ? `${p.wetlands.pctOfParcel}%` : p.wetlands.classes.length ? "present" : "—") : "?"}</td>
  </tr>`).join("");

  const dd = (label: string, value: string, ok: boolean | null, note = "") => `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:700;color:${SLATE};width:210px">${esc(label)}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9">${value}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right">${ok === null ? tbv() : pill(ok, ok ? "CONFIRMED" : "REVIEW")}</td>
  </tr>${note ? `<tr><td></td><td colspan="2" style="padding:0 10px 8px;font-size:10px;color:${LIGHT}">${esc(note)}</td></tr>` : ""}`;

  const manual = m.manual;
  // Manual diligence row: team-entered = CONFIRMED; distilled from the seller
  // call = shown but stays 🟡 ("Per seller — verify"); blank = 🟡 TBV.
  const mrow = (k: keyof typeof manual, label: string, note = "") => {
    const v = manual[k];
    const fromSeller = m.sellerSourced?.includes(k);
    if (!v) return dd(label, tbv(), null, note);
    if (fromSeller) return dd(label, `${esc(v)} <span style="font-size:10px;color:#a16207;font-weight:700">· per seller — verify</span>`, null, note);
    return dd(label, esc(v), true, note);
  };
  const page = (inner: string) => `<div style="page-break-after:always;padding:34px 40px">${inner}</div>`;
  const tabHeader = (tab: string, title: string, caption: string) => `
    <div style="border-bottom:3px solid ${GOLD};padding-bottom:8px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:${GOLD}">TAB ${esc(tab)}</div>
      <div style="font-size:21px;font-weight:800;color:${NAVY}">${esc(title)}</div>
      <div style="font-size:11px;color:${LIGHT};margin-top:2px">${esc(caption)}</div>
    </div>`;
  const img = (url: string, alt: string) => url
    ? `<img src="${esc(url)}" alt="${esc(alt)}" style="width:100%;max-height:540px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px"/>`
    : `<div style="border:1px dashed #cbd5e1;border-radius:10px;padding:60px;text-align:center;color:${LIGHT}">map unavailable — ${tbv()}</div>`;

  // ── COVER ──
  const cover = page(`
    <div style="height:72px"></div>
    <div style="border-left:6px solid ${GOLD};padding-left:22px">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:${GOLD}">FREEDOM OFFERS · OFF-MARKET OFFERING</div>
      <div style="font-size:34px;font-weight:800;color:${NAVY};line-height:1.15;margin-top:8px">${esc(m.title)}</div>
      <div style="font-size:15px;color:${SLATE};margin-top:6px">${esc(m.county)} County, ${esc(m.state)} · ${esc(m.totals.parcels)} parcel${m.totals.parcels === 1 ? "" : "s"} · ${esc(acresTotal)}</div>
    </div>
    <div style="margin:26px 0">${img(p0?.satUrl ?? "", "site aerial")}</div>
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      ${tile("Parcels", String(m.totals.parcels))}
      ${tile("Total acres", acresTotal)}
      ${tile("Flood zone", floodZones)}
      ${tile("Wetlands", wetMax < 0 ? "verify" : wetMax === 0 ? "none found" : `≤${wetMax}%`)}
    </tr></table>
    <div style="margin-top:26px;font-size:10px;color:${LIGHT}">Prepared ${esc(m.generatedAt.slice(0, 10))} · DRAFT — internal review before sending · Parcel geometry per ${esc(p0?.parcel.source ?? "county records")}; not survey-verified.</div>`);

  // ── OFFERING SUMMARY & TERMS ──
  const summary = page(`
    ${tabHeader("", "Offering Summary & Terms", "What is being offered and how to proceed")}
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <tr style="background:${NAVY};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.6px">
        <th style="padding:8px 9px;text-align:left">APN</th><th style="padding:8px 9px;text-align:left">Situs</th>
        <th style="padding:8px 9px;text-align:right">Acres</th><th style="padding:8px 9px;text-align:left">Zoning</th>
        <th style="padding:8px 9px;text-align:left">Flood</th><th style="padding:8px 9px;text-align:left">Wetlands</th></tr>
      ${schedule}
    </table>
    ${m.highlights?.length ? `<div style="margin-top:14px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:${GOLD};margin-bottom:5px">Site highlights</div>
      ${m.highlights.map((h) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 12px;border:1px solid #e2e8f0;border-radius:999px;font-size:12px;font-weight:600;color:${SLATE}">${esc(h)}</span>`).join("")}
      <div style="font-size:9px;color:${LIGHT}">Site details per owner interview &amp; public records — buyer to verify.</div></div>` : ""}
    <div style="margin-top:16px;font-size:12px;color:${SLATE};line-height:1.6">
      <b style="color:${NAVY}">Terms:</b> Sold as-is, where-is. Buyer to verify all information independently. Assignment of contract or double close.
      Pricing on request — contact us to discuss. EMD due within 48 hours of acceptance. Close on or before the date in the assignment agreement.
    </div>
    ${m.manual.notes ? `<div style="margin-top:10px;font-size:12px;color:${SLATE}"><b style="color:${NAVY}">Notes:</b> ${esc(m.manual.notes)}</div>` : ""}`);

  // ── SITE & DUE DILIGENCE SUMMARY ──
  const f0 = p0?.flood;
  const diligence = page(`
    ${tabHeader("", "Site & Due Diligence Summary", "Everything checked so far — 🟡 items need a county call before close")}
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px">
      ${dd("FEMA flood zone", f0 ? `${esc(f0.zone || "—")}${f0.subtype ? ` (${esc(f0.subtype)})` : ""}${f0.bfe ? ` · BFE ${esc(f0.bfe)} ft` : ""}` : tbv(), f0 ? !(f0.sfha ?? false) : null, f0?.panel ? `Panel ${f0.panel}${f0.panelDate ? ` · effective ${f0.panelDate}` : ""} (NFHL)` : "")}
      ${dd("Wetlands (NWI)", p0?.wetlands ? (p0.wetlands.classes.length ? p0.wetlands.classes.map((c) => esc(c.attribute)).join(", ") + (p0.wetlands.pctOfParcel != null ? ` · ~${p0.wetlands.pctOfParcel}% of parcel` : "") : "none mapped on parcel") : tbv(), p0?.wetlands ? p0.wetlands.classes.length === 0 : null, "USFWS National Wetlands Inventory — not a jurisdictional determination")}
      ${dd("Soils (USDA)", p0?.soils.length ? esc(p0.soils.map((s) => `${s.name} ${s.pct}%`).slice(0, 2).join(" · ")) : tbv(), p0?.soils.length ? true : null, "Full table in Tab D")}
      ${dd("Elevation / slope", p0?.elevation?.minFt != null ? `${p0.elevation.minFt}–${p0.elevation.maxFt} ft · ~${p0.elevation.slopePct}% slope` : tbv(), p0?.elevation?.minFt != null ? true : null, "USGS 3DEP spot checks")}
      ${mrow("utilitiesWater", "Water")}
      ${mrow("utilitiesSewer", "Sewer / septic")}
      ${mrow("electric", "Electric")}
      ${mrow("setbacks", "Setbacks / buildable")}
      ${mrow("species", "Listed species", m.state === "FL" ? "FL: confirm scrub-jay review zone with county" : "")}
    </table>
    ${m.countyPhone ? `<div style="margin-top:12px;font-size:11px;color:${SLATE}">☎️ County planning/utilities: <b>${esc(m.countyPhone)}</b> — fastest way to clear the 🟡 items.</div>` : ""}
    <div style="margin-top:18px">
      <div style="font-size:12px;font-weight:800;color:${NAVY};margin-bottom:6px">ATTACHED DOCUMENTATION</div>
      <div style="font-size:12px;color:${SLATE};line-height:1.9">
        Tab A — Parcel aerials &amp; boundaries (${m.totals.parcels})<br>
        Tab B — FEMA NFHL flood map &amp; panel data<br>
        Tab C — NWI wetlands overlay<br>
        Tab D — USDA soils report
      </div>
    </div>`);

  // ── TABS A–D ──
  const tabA = m.parcels.map((p, i) => page(`
    ${tabHeader("A", `Parcel ${i + 1} of ${m.parcels.length} — APN ${p.parcel.apn}`, `${p.parcel.address || m.county + " County"} · ${p.parcel.acres != null ? p.parcel.acres.toFixed(2) + " ac" : "acreage TBV"} · geometry per ${p.parcel.source}; not survey-verified`)}
    ${img(p.satUrl, `parcel ${p.parcel.apn}`)}`)).join("");
  const tabB = page(`
    ${tabHeader("B", "FEMA Flood (NFHL export)", f0?.panel ? `Panel ${f0.panel}${f0.panelDate ? ` · effective ${f0.panelDate}` : ""} — NFHL export, not an official FIRMette` : "NFHL export — not an official FIRMette")}
    ${img(f0?.mapUrl ?? "", "FEMA flood map")}
    ${m.parcels.map((p) => `<div style="font-size:11px;color:${SLATE};margin-top:6px"><b>${esc(p.parcel.apn)}</b>: zone ${esc(p.flood?.zone || "TBV")}${p.flood?.bfe ? ` · BFE ${esc(p.flood.bfe)} ft` : ""}${p.flood?.sfha ? " · in SFHA" : ""}</div>`).join("")}`);
  const tabC = page(`
    ${tabHeader("C", "Wetlands (USFWS NWI)", "Inventory overlay — presence/absence per NWI; not a jurisdictional determination")}
    ${img(p0?.wetlands?.mapUrl ?? "", "NWI wetlands")}
    ${m.parcels.map((p) => `<div style="font-size:11px;color:${SLATE};margin-top:6px"><b>${esc(p.parcel.apn)}</b>: ${p.wetlands ? (p.wetlands.classes.length ? p.wetlands.classes.map((c) => `${esc(c.attribute)} (${esc(c.type)})`).join(", ") + (p.wetlands.pctOfParcel != null ? ` · ~${p.wetlands.pctOfParcel}%` : "") : "none mapped") : "TBV"}</div>`).join("")}`);
  const soilRows = (p0?.soils ?? []).map((s) => `<tr>
    <td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;font-weight:600">${esc(s.name)}</td>
    <td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right">${s.pct}%</td>
    <td style="padding:7px 9px;border-bottom:1px solid #f1f5f9">${esc(s.drainage || "—")}</td>
    <td style="padding:7px 9px;border-bottom:1px solid #f1f5f9">${esc(s.hydric || "—")}</td>
    <td style="padding:7px 9px;border-bottom:1px solid #f1f5f9">${esc(s.flooding || "—")}</td></tr>`).join("");
  const tabD = page(`
    ${tabHeader("D", "Soils (USDA Soil Survey)", "Map units intersecting the parcels — drainage, hydric rating, flooding frequency")}
    ${soilRows ? `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px">
      <tr style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:${LIGHT}"><th style="padding:7px 9px;text-align:left">Map unit</th><th style="padding:7px 9px;text-align:right">% of AOI</th><th style="padding:7px 9px;text-align:left">Drainage</th><th style="padding:7px 9px;text-align:left">Hydric</th><th style="padding:7px 9px;text-align:left">Flooding</th></tr>
      ${soilRows}</table>` : `<div style="color:${LIGHT}">Soil query unavailable — ${tbv()}</div>`}`);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.title)}</title>
  <style>@page{size:letter;margin:0}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>
  </head><body>${cover}${summary}${diligence}${tabA}${tabB}${tabC}${tabD}</body></html>`;
}
