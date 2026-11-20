// Phase-2 data ops for the vetted-buyers rebuild (BUILD_SPEC §3) — one-shot,
// idempotent, CRON_SECRET- or admin-gated. Everything goes through the
// history-logging write path (rule zero: no deletes, nothing silent).
//   ?op=interviews  → migrate the __buyer_land__ interview JSON → buyBoxStruct (source "interview")
//   ?op=backfill    → load the 60 parsed buy boxes (source "backfill_2026-09-22";
//                     never overwrites source manual/interview)
//   ?op=centroids&limit=25 → geocode a centroid for buyers with a buy box but no
//                     centroid yet (Nominatim-throttled; rerun until remaining=0)
//   ?op=duong_buyers → load Jonathan Duong's proven GGE builder/investor buyers
//                     (from Collier deeds) into Vetted Buyers; idempotent, deduped
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { setBuyBox, updateBuyer, createBuyer } from "@/lib/buyers/write";
import { emptyBuyBox, type BuyBox, type AssetType } from "@/lib/buybox/types";
import { geocode } from "@/lib/geo/geocode";
import type { BuyerLand } from "@/lib/buyer-land";
import backfillRaw from "@/lib/buybox/backfill-2026-09-22.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LAND_TYPE_MAP: Record<string, AssetType[]> = {
  "Infill lots": ["raw_land"],
  "Teardowns": ["teardown"],
  "Entitled / paper lots": ["entitled_land"],
  "Subdivision acreage": ["raw_land"],
  "Rural / recreational": ["raw_land", "ag_land"],
  "Commercial pads": ["commercial"],
  "Build-to-rent tracts": ["entitled_land"],
  "Agricultural": ["ag_land"],
};
const CLOSE_DAYS: Record<string, number> = {
  "Cash — under 14 days": 14, "15–30 days": 30, "30–60 days": 60, "Needs financing / longer": 120,
};

function interviewToBuyBox(id: string, l: BuyerLand): BuyBox {
  const box = emptyBuyBox(id, "interview");
  const lines = (s?: string) => (s ?? "").split(/[\n;]+/).map((x) => x.trim()).filter(Boolean);
  box.geo.states = (l.buyStates ?? "").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
  box.geo.counties = lines(l.buyCounties).map((c) => c.replace(/\s+county/i, "").replace(/\s+/g, " "));
  box.geo.cities = lines(l.buyCities);
  box.geo.zips = (l.targetZips ?? "").split(/[\s,;]+/).filter((z) => /^\d{5}$/.test(z));
  box.asset.types = [...new Set((l.landTypes ?? "").split(",").map((s) => s.trim()).flatMap((t) => LAND_TYPE_MAP[t] ?? []))];
  box.size.acres_min = l.lotMin ?? null;
  box.size.acres_max = l.lotMax ?? null;
  if (l.priceMin || l.priceMax) { box.price.min = l.priceMin ?? null; box.price.max = l.priceMax ?? null; box.price.unit = "total"; }
  else if (l.pricePerLot) { box.price.min = null; box.price.max = l.pricePerLot; box.price.unit = "per_lot"; }
  if (l.closeSpeed) {
    box.terms.close_days = CLOSE_DAYS[l.closeSpeed] ?? null;
    if (/^cash/i.test(l.closeSpeed)) box.terms.funding = "cash";
  }
  box.status.buying_now = l.isLandBuyer ?? null;
  box.status.volume_note = [l.lotsPerYear ? `${l.lotsPerYear} lots/deals per yr` : "", l.permits12mo ? `${l.permits12mo} permits/12mo` : "", l.acresTypical ?? ""].filter(Boolean).join(" · ");
  if (l.dealBreakers) box.asset.exclusions = l.dealBreakers.split(",").map((s) => s.trim()).filter(Boolean);
  box.confidence = "medium";
  return box;
}

/** Anything actually answered in the interview? (Blank interviews aren't migrated.) */
function interviewHasContent(l: BuyerLand): boolean {
  return Boolean(l.buyCounties || l.buyCities || l.buyStates || l.targetZips || l.landTypes || l.lotMin || l.lotMax || l.priceMin || l.priceMax || l.pricePerLot || l.closeSpeed || l.dealBreakers);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const me = await getCurrentUser();
  const secret = process.env.CRON_SECRET;
  const secretOk = Boolean(secret) && (url.searchParams.get("secret") === secret || request.headers.get("authorization") === `Bearer ${secret}`);
  if (!isAdmin(me) && !secretOk) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const op = url.searchParams.get("op") ?? "";
  const actor = me?.name ?? "claude-backfill";

  if (op === "interviews") {
    const row = await db.resource.findFirst({ where: { category: "__buyer_land__" } });
    let land: Record<string, BuyerLand> = {};
    try { land = JSON.parse(row?.description || "{}"); } catch {}
    let migrated = 0, skippedProtected = 0, skippedEmpty = 0, missing = 0;
    for (const [id, l] of Object.entries(land)) {
      if (!interviewHasContent(l)) { skippedEmpty++; continue; }
      const buyer = await db.marketContact.findUnique({ where: { id }, select: { buyBoxSource: true } });
      if (!buyer) { missing++; continue; }
      if (buyer.buyBoxSource === "manual" || buyer.buyBoxSource === "interview") { skippedProtected++; continue; }
      await setBuyBox(id, interviewToBuyBox(id, l), "interview", actor);
      migrated++;
    }
    return NextResponse.json({ ok: true, op, migrated, skippedProtected, skippedEmpty, missing });
  }

  if (op === "backfill") {
    const rows = backfillRaw as { buyer_id: string; name: string; buy_box: Record<string, unknown> }[];
    const matched: string[] = []; const unmatched: string[] = []; const skipped: string[] = [];
    for (const r of rows) {
      let buyer = await db.marketContact.findUnique({ where: { id: r.buyer_id }, select: { id: true, buyBoxSource: true } }).catch(() => null);
      if (!buyer) buyer = await db.marketContact.findFirst({ where: { name: r.name }, select: { id: true, buyBoxSource: true } });
      if (!buyer) { unmatched.push(r.name); continue; }
      if (buyer.buyBoxSource === "manual" || buyer.buyBoxSource === "interview") { skipped.push(r.name); continue; }
      const box = { ...r.buy_box, buyer_id: buyer.id, source: "backfill_2026-09-22" };
      await setBuyBox(buyer.id, box, "backfill_2026-09-22", actor);
      matched.push(r.name);
    }
    return NextResponse.json({ ok: true, op, matched: matched.length, unmatched, skippedProtected: skipped });
  }

  if (op === "centroids") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 40);
    const candidates = await db.marketContact.findMany({
      where: { buyBoxStruct: { not: undefined }, geoCentroidLat: null, archivedAt: null },
      select: { id: true, name: true, buyBoxStruct: true },
    });
    // Only buyers whose box gives us something geocodable.
    const todo = candidates.filter((c) => c.buyBoxStruct);
    let done = 0, misses = 0;
    const details: string[] = [];
    for (const c of todo.slice(0, limit)) {
      const box = c.buyBoxStruct as unknown as BuyBox;
      const target =
        box.geo?.radius?.center ||
        box.geo?.cities?.[0] ||
        (box.geo?.counties?.[0] ? `${box.geo.counties[0].split(",")[0]} County, ${box.geo.counties[0].split(",")[1] ?? ""}` : "") ||
        box.geo?.zips?.[0] ||
        (box.geo?.states?.[0] ? `${box.geo.states[0]}, USA` : "");
      if (!target) { misses++; details.push(`${c.name}: nothing geocodable`); continue; }
      const g = box.geo?.radius ? { lat: box.geo.radius.lat, lng: box.geo.radius.lng } : await geocode(target);
      if (!g) { misses++; details.push(`${c.name}: geocode miss for "${target}"`); }
      else { await updateBuyer(c.id, { geoCentroidLat: g.lat, geoCentroidLng: g.lng }, actor, { field: "geoCentroid" }); done++; }
      if (!process.env.GOOGLE_MAPS_API_KEY && !process.env.MAPBOX_TOKEN) await new Promise((r) => setTimeout(r, 1100)); // Nominatim: 1 req/s
    }
    return NextResponse.json({ ok: true, op, done, misses, remaining: Math.max(0, todo.length - limit), details: details.slice(0, 10) });
  }

  if (op === "duong_buyers") {
    // Jonathan Duong's (Upland Capital Group LLC) proven Golden Gate Estates land buyers,
    // pulled from Collier County deeds (public record — names only, no PII). Loaded into
    // Vetted Buyers, source-tagged. Idempotent: createBuyer dedupes (phone→email→name/
    // company) and returns {dup}, so re-running is safe and tells us who we already had.
    type Seed = { name: string; company?: string; type: string; vetStage: string; buyBox: string };
    // 13 builder/investor LLCs → vetted (repeat cash buyers = the dispo channel):
    const BUILDERS: Seed[] = [
      { name: "Pals Builders LLC", company: "Pals Builders LLC", type: "developer", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 47 Tr 8 (Jan 2026), Unit 62 Tr 23 (Apr 2025)" },
      { name: "Construction 2018 Corp", company: "Construction 2018 Corp", type: "developer", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 43 Tr 153 (Feb 2025), Unit 64 Tr 43 (Oct 2024)" },
      { name: "Synergy Invest LLC", company: "Synergy Invest LLC", type: "investor", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 77 Tr 100 (Jun 2025), Unit 64 Tr 58 (Mar 2025), Unit 40 Tr 63 (Sep 2024)" },
      { name: "IRL Construction Inc", company: "IRL Construction Inc", type: "developer", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 43 Tr 153 (Oct 2025)" },
      { name: "Herrod Construction LLC", company: "Herrod Construction LLC", type: "developer", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 81 Tr 16 (Jul 2024)" },
      { name: "Above Homes Corporation", company: "Above Homes Corporation", type: "developer", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 61 Tr 46 (May 2024)" },
      { name: "Y&C Development Homes LLC", company: "Y&C Development Homes LLC", type: "developer", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 81 Tr 17 (Dec 2023)" },
      { name: "PHL Capital Inc", company: "PHL Capital Inc", type: "investor", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 62 Tr 85 (Nov 2025)" },
      { name: "Munguia Group LLC", company: "Munguia Group LLC", type: "investor", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 86 Tr 44 (Jun 2026)" },
      { name: "JC & MIL Consulting LLC", company: "JC & MIL Consulting LLC", type: "investor", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 82 Tr 129 (Mar 2025)" },
      { name: "Bernsen Enterprises LLC", company: "Bernsen Enterprises LLC", type: "investor", vetStage: "vetted", buyBox: "GGE Naples — bought Sec 30-49S-27E (Aug 2025)" },
      { name: "HM Sunshine LLC", company: "HM Sunshine LLC", type: "investor", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 64 Tr 98 (Jun 2024)" },
      { name: "Como Ventures LLC", company: "Como Ventures LLC", type: "investor", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 85 Tr 73 (Oct 2023)" },
      { name: "iPermitting Services Corp", company: "iPermitting Services Corp", type: "developer", vetStage: "vetted", buyBox: "GGE Naples — bought Unit 83 Tr 123 (Sep 2026)" },
    ];
    // 6 individual end-buyers (self-build / one-off) → to_vet (in the system, not auto-cascaded):
    const INDIVIDUALS: Seed[] = [
      { name: "Carrillo Sarah Neli", type: "cash_buyer", vetStage: "to_vet", buyBox: "GGE Naples — bought Sec 23-47S-27E (Jul 2026)" },
      { name: "Poulson Jessica Ashley", type: "cash_buyer", vetStage: "to_vet", buyBox: "GGE Naples — bought Sec 31-49S-27E (Dec 2025)" },
      { name: "Ochoa Jonathan F Mejia", type: "cash_buyer", vetStage: "to_vet", buyBox: "GGE Naples — bought Unit 73 Tr 114 (Jul 2025)" },
      { name: "Elliott Austin Michael & Liset", type: "cash_buyer", vetStage: "to_vet", buyBox: "GGE Naples — bought Unit 51 Tr 116 (Jun 2024)" },
      { name: "Billie Corey & Michelle", type: "cash_buyer", vetStage: "to_vet", buyBox: "GGE Naples — bought Unit 84 Lot 6 (Dec 2024)" },
      { name: "Pinero Robert", type: "cash_buyer", vetStage: "to_vet", buyBox: "GGE Naples — bought Unit 51 Tr 78 (Apr 2024)" },
    ];
    const all = [...BUILDERS, ...INDIVIDUALS];
    const created: string[] = []; const existing: string[] = [];
    for (const b of all) {
      const res = await createBuyer(
        {
          name: b.name, company: b.company ?? "", type: b.type, category: "land",
          companySize: "Mom & Pop", region: "FL", market: "Golden Gate Estates / Naples",
          vetStage: b.vetStage, buyBox: b.buyBox, status: "Duong buyer",
          notes: "Proven GGE land buyer from Jonathan Duong (Upland Capital Group LLC) Collier County closings. Contacts pending skip-trace — not in the deed index.",
          source: "Duong closed-deal buyer",
        },
        actor,
        { isLand: true, targetStates: ["FL"] },
      );
      if (res.created) created.push(b.name); else existing.push(`${b.name} (had: ${res.id})`);
    }
    return NextResponse.json({ ok: true, op, loaded: created.length, created, alreadyHad: existing.length, existing });
  }

  return NextResponse.json({ error: "unknown op — use interviews | backfill | centroids | duong_buyers" }, { status: 400 });
}
