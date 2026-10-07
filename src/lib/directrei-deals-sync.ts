// Direct REI → War Room deal sync (Jon 2026-10-06). Direct REI is the
// ACQUISITIONS pipeline (New – Interested → Qualifying → Offer Made → Verbal
// Yes → Under Contract → Marketing to Buyers → At Title → Closed / Dead).
// The War Room Deals board is the DISPO pipeline (under_contract → marketing →
// buyer_found → in_escrow → closed / dead). Jon's rule: a deal only matters to
// dispo once it is UNDER CONTRACT — so that is the hand-off point.
//
// One-way (Direct REI → War Room): the Direct REI API exposes deals read-only.
//   • Deal reaches Under Contract (or later) in Direct REI → War Room deal is
//     created once (address, APN/county into land fields, contract price, fee).
//   • Direct REI stage moves forward → War Room status moves forward, never back
//     (dispo may already be at buyer_found / in_escrow — we never regress them).
//   • Direct REI Dead / Closed → War Room dead / closed.
//   • Prices: only fill War Room blanks; dispo-typed numbers always win.
// Mapping Direct REI deal id → War Room deal id lives in a Resource row
// (same pattern as the feed + GHL push) so no schema change is needed.
import { db } from "@/lib/db";
import { directReiConfigured, directReiDeals, directReiProperty } from "@/lib/directrei";

export const DREI_DEAL_MAP_CAT = "__directrei_deal_map__";

// Stage ids from Jon's Direct REI account (Pipeline Stages, 2026-10-06).
// Renaming a stage in Direct REI keeps its id, so this stays valid.
export const DREI_STAGES: Record<string, string> = {
  "fed94107-2e5f-44c4-904d-f4d9b669a021": "New – Interested",
  "55a4b955-7ca9-476c-8dd5-2bdf7984f579": "Qualifying",
  "526fc086-f2d2-430c-a4cd-15b8bdbad497": "Offer Made",
  "5b50d15b-fda5-421a-96e3-8c8d6c6d8c26": "Verbal Yes / Contract Sent",
  "7135d897-f680-41b0-b9b5-7bdd445405a4": "Under Contract",
  "5c4c3eb1-79dc-47ed-9bef-0d4675ea41da": "Marketing to Buyers",
  "048fbdd4-cfaf-4f8d-9822-c8d014c95656": "At Title",
  "d904082d-73c6-4982-be47-76b7360ae55e": "Closed",
  "4275b7f5-f899-45a1-a161-875bf9a42792": "Dead",
};

// Direct REI stage → War Room status. Pre-contract stages map to null (acq only).
const STAGE_TO_STATUS: Record<string, string | null> = {
  "New – Interested": null, "Qualifying": null, "Offer Made": null, "Verbal Yes / Contract Sent": null,
  "Under Contract": "under_contract", "Marketing to Buyers": "marketing", "At Title": "in_escrow",
  "Closed": "closed", "Dead": "dead",
};
const RANK: Record<string, number> = { under_contract: 1, marketing: 2, buyer_found: 3, in_escrow: 4, closed: 5, dead: 5 };

type DreiDeal = {
  id: string; name?: string; stage_id?: string; offer_price?: string | number | null; contract_price?: string | number | null;
  arv?: string | number | null; assignment_fee?: string | number | null; emv?: string | number | null;
  seller_id?: string | null; property_id?: string | null; closing_date?: string | null; created_at?: string; updated_at?: string;
};
type DreiProperty = { address?: string; city?: string; state?: string; zip?: string; county?: string; parcel_id?: string; lot_size?: string };

const num = (v: unknown): number | null => { const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, "")); return v === "" || v == null || Number.isNaN(n) ? null : n; };

async function loadMap(): Promise<{ row: { id: string } | null; map: Record<string, string> }> {
  const row = await db.resource.findFirst({ where: { category: DREI_DEAL_MAP_CAT } }).catch(() => null);
  let map: Record<string, string> = {};
  try { if (row) map = JSON.parse(row.description) as Record<string, string>; } catch { /* fresh */ }
  return { row, map };
}
async function saveMap(row: { id: string } | null, map: Record<string, string>) {
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "directrei-deal-map", category: DREI_DEAL_MAP_CAT, url: "", description } });
}

export type DreiDealSyncResult = { ran: boolean; scanned: number; created: string[]; advanced: string[]; skipped: number; errors: number };

/** Pull Direct REI deals and mirror the under-contract-and-later ones onto the War Room board. */
export async function syncDreiDeals(todayYmd: string): Promise<DreiDealSyncResult> {
  const out: DreiDealSyncResult = { ran: false, scanned: 0, created: [], advanced: [], skipped: 0, errors: 0 };
  if (!directReiConfigured()) return out;
  out.ran = true;
  const { row, map } = await loadMap();
  let dirty = false;

  for (let page = 0; page < 10; page++) {
    const res = await directReiDeals({ limit: "100", offset: String(page * 100) });
    if (!res.ok) { out.errors++; break; }
    const body = res.body as { rows?: DreiDeal[]; has_more?: boolean };
    const rows = body.rows ?? [];
    for (const d of rows) {
      out.scanned++;
      const stageName = DREI_STAGES[String(d.stage_id ?? "")] ?? "";
      const target = STAGE_TO_STATUS[stageName] ?? null;
      const existingId = map[d.id];

      if (!existingId) {
        // Not yet in the War Room: only hand off at Under Contract or later (never Dead-only).
        if (!target || target === "dead") { out.skipped++; continue; }
        let prop: DreiProperty = {};
        if (d.property_id) { const p = await directReiProperty(d.property_id); if (p.ok && p.body && typeof p.body === "object") prop = p.body as DreiProperty; }
        const address = [prop.address || d.name || "(Direct REI deal)", prop.city, prop.state].filter(Boolean).join(", ");
        try {
          const created = await db.deal.create({
            data: {
              address,
              status: target,
              contractPrice: num(d.contract_price),
              assignmentFee: num(d.assignment_fee),
              askingPrice: num(d.emv) ?? num(d.arv),
              dealType: "Wholesale",
              source: "Direct REI",
              contractDate: todayYmd, // first seen under contract — dispo can correct it
              soldDate: target === "closed" ? (d.closing_date ?? "").slice(0, 10) : "",
              nextSteps: target === "under_contract" ? "Build land offering packet → run Vetted Buyers cascade" : "",
              notes: `Synced from Direct REI (deal ${d.id}). APN ${prop.parcel_id || "—"} · ${prop.county || "county —"} · ${prop.zip || ""}`.trim(),
            },
          });
          map[d.id] = created.id; dirty = true; out.created.push(address);
          // Seed the land-diligence card with what Direct REI already knows.
          if (prop.parcel_id || prop.county) {
            const landRow = await db.resource.findFirst({ where: { category: "__deal_land__" } }).catch(() => null);
            let land: Record<string, Record<string, string>> = {};
            try { if (landRow) land = JSON.parse(landRow.description); } catch { /* fresh */ }
            land[created.id] = { ...(land[created.id] ?? {}), ...(prop.parcel_id ? { apn: prop.parcel_id } : {}), ...(prop.county ? { county: prop.county } : {}) };
            if (landRow) await db.resource.update({ where: { id: landRow.id }, data: { description: JSON.stringify(land) } });
            else await db.resource.create({ data: { title: "deal-land", category: "__deal_land__", url: "", description: JSON.stringify(land) } });
          }
        } catch { out.errors++; }
        continue;
      }

      // Already mirrored: move forward only, fill blanks only.
      const wr = await db.deal.findUnique({ where: { id: existingId } }).catch(() => null);
      if (!wr) { delete map[d.id]; dirty = true; continue; }
      const data: Record<string, unknown> = {};
      if (target && (RANK[target] ?? 0) > (RANK[wr.status] ?? 0) && !["closed", "dead"].includes(wr.status)) {
        data.status = target;
        if (target === "closed" && !wr.soldDate) data.soldDate = (d.closing_date ?? todayYmd).slice(0, 10);
        if (target === "marketing" && !wr.onMarketSince) data.onMarketSince = todayYmd;
      }
      if (wr.contractPrice == null && num(d.contract_price) != null) data.contractPrice = num(d.contract_price);
      if (wr.assignmentFee == null && num(d.assignment_fee) != null) data.assignmentFee = num(d.assignment_fee);
      if (Object.keys(data).length) {
        try { await db.deal.update({ where: { id: existingId }, data }); if (data.status) out.advanced.push(`${wr.address} → ${data.status}`); } catch { out.errors++; }
      }
    }
    if (!body.has_more || rows.length === 0) break;
  }
  if (dirty) await saveMap(row, map);
  return out;
}
