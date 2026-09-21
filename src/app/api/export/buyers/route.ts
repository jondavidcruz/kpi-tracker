// CSV export of the vetted buyers/developers list — one clean spreadsheet with
// every contact field + the full standard buy-box interview per row (Jon
// 2026-09-21: "the leads are very unorganized with the notes"). Opens straight
// in Excel/Sheets. Marketing-gated like the pages that show this data.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, canAccessMarketing, isManager } from "@/lib/auth";
import { type BuyerLand, interviewScore } from "@/lib/buyer-land";

export const dynamic = "force-dynamic";

const esc = (v: unknown): string => {
  const s = String(v ?? "").replace(/\r?\n/g, " | ").trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me || (!canAccessMarketing(me) && !isManager(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [rows, landRow] = await Promise.all([
    db.marketContact.findMany({ where: { vetStage: { in: ["vetted", "active"] } }, orderBy: [{ category: "desc" }, { name: "asc" }] }),
    db.resource.findFirst({ where: { category: "__buyer_land__" } }),
  ]);
  let land: Record<string, BuyerLand> = {};
  try { land = JSON.parse(landRow?.description || "{}"); } catch { land = {}; }

  const header = [
    "Name", "Company", "Contact / title", "Buyer type", "Status",
    "Phone", "Phone 2", "Email", "Website / links", "Market", "Buying areas",
    "States", "Counties", "Cities", "Target ZIPs",
    "Land types", "Lot min (ac)", "Lot max (ac)", "Acres sought",
    "Price min ($)", "Price max ($)", "$ / lot", "Close speed",
    "Utilities", "Zoning", "Lots per year", "Permits 12mo", "Builder type",
    "Deal breakers", "Interview notes", "Interview score",
    "Last contacted", "Next follow-up", "Notes / outreach log",
  ];

  const lines = rows
    .filter((r) => r.type !== "jv_partner")
    .map((r) => {
      const l = land[r.id] ?? {};
      const score = interviewScore(l);
      return [
        r.name, r.company, r.title, r.category === "luxury" || r.type === "developer" ? "Developer" : "Fix & Flipper", r.vetStage,
        r.phone, r.phone2, r.email, r.links || r.website, r.market, r.buyBoxAreas,
        l.buyStates, l.buyCounties, l.buyCities, l.targetZips,
        l.landTypes, l.lotMin, l.lotMax, l.acresTypical,
        l.priceMin, l.priceMax, l.pricePerLot, l.closeSpeed,
        l.utilities ?? (l.utilitiesRequired ? "Must have utilities at street" : ""), l.zoningPref,
        l.lotsPerYear, l.permits12mo, l.builderType,
        l.dealBreakers, l.notes, `${score.done}/${score.total}`,
        r.lastContacted, r.nextFollowUp, r.outreachLog,
      ].map(esc).join(",");
    });

  const today = new Date().toISOString().slice(0, 10);
  // BOM so Excel opens UTF-8 (accents, emoji in notes) correctly.
  const csv = "﻿" + [header.map(esc).join(","), ...lines].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vetted-developers-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
