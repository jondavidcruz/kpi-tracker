// One-click channel ad copy (Jon 2026-10-06: passive marketing should be a
// paste, not a 45-minute writing session). Deterministic templates built from
// the deal + land diligence — no AI call, instant, free, and always on-brand.
import type { Deal } from "@prisma/client";
import type { DealLand } from "@/lib/deal-land";

const money = (n: number | null | undefined) => (n == null ? "" : `$${Math.round(n).toLocaleString()}`);

function facts(deal: Deal, land?: DealLand): string[] {
  const f: string[] = [];
  if (land?.acreage) f.push(`${land.acreage} acres`);
  else if (land?.lotSqFt) f.push(`${Number(land.lotSqFt).toLocaleString()} sq ft lot`);
  if (land?.zoning) f.push(`zoned ${land.zoning}`);
  if (land?.floodZone === "No") f.push("NOT in a flood zone");
  if (land?.wetlandsPct === "0") f.push("no wetlands");
  if (land?.legalAccess === "Yes") f.push("legal access confirmed");
  if (land?.water && land.water !== "Unknown" && land.water !== "None") f.push(`water: ${land.water.toLowerCase()}`);
  if (land?.power === "At site" || land?.power === "Nearby") f.push(`power ${land.power.toLowerCase()}`);
  return f;
}

export type AdCopy = { channel: string; emoji: string; text: string };

export function buildAdCopy(deal: Deal, land?: DealLand): AdCopy[] {
  const price = deal.askingPrice ?? null;
  const f = facts(deal, land);
  const factLine = f.length ? f.join(" · ") : "full diligence packet available";
  const priceLine = price ? `${money(price)} — priced to move.` : "Priced to move — ask for numbers.";
  const contact = "Reply here or email info@freedom-offers.com for the full diligence packet (flood, wetlands, soils, maps).";

  const craigslist = `🏞️ OFF-MARKET LAND — ${deal.address}

${factLine}.
${priceLine}

Clean, builder-ready opportunity. We have this under exclusive contract — first come, first served. Full due-diligence packet ready to send: parcel maps, FEMA flood, wetlands, soils.

${contact}`;

  const facebook = `🔥 Builders & investors — off-market land just hit our desk.

📍 ${deal.address}
✅ ${f.length ? f.join("\n✅ ") : "Diligence packet ready"}
💰 ${price ? `${money(price)}` : "DM for pricing"}

These go FAST (our goal is a buyer in 24 hours). Comment "PACKET" or DM and the full diligence packet is yours.`;

  const skool = `New off-market land deal for the community 👇

${deal.address}
${factLine}
${price ? `Asking: ${money(price)}` : "Pricing on request"}

Diligence already done — flood, wetlands, soils, and parcel maps in one packet. First serious buyer gets it. Drop a comment or DM me for the packet.`;

  return [
    { channel: "Craigslist", emoji: "📋", text: craigslist },
    { channel: "Facebook / Marketplace", emoji: "📘", text: facebook },
    { channel: "Skool / communities", emoji: "🎓", text: skool },
  ];
}
