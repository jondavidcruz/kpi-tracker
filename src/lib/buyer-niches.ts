// 🎯 Buyer ↔ niche tagging (Jon 2026-11-09). Two layers:
//   1) AUTO-SUGGEST — infer a buyer's niche(s) from their existing buy-box text (no typing).
//   2) MANUAL OVERRIDE — Jon/managers pick niches on the vetting buy-box form; those win.
// Manual tags are stored as reserved Resource JSON (category __buyer_niches__, a single row
// mapping contactId → nicheId[]) — NO schema migration (DIRECT_URL is unreachable from Vercel).
// Server-only (uses db). The pure matcher/suggester lives in land-niches.ts (client-safe).
import { db } from "./db";
import { suggestNichesFromText, NICHES } from "./land-niches";

const CAT = "__buyer_niches__";

export type NicheMap = Record<string, string[]>; // contactId -> [nicheId]

export async function readBuyerNicheMap(): Promise<NicheMap> {
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    if (!row) return {};
    const m = JSON.parse(row.description || "{}");
    return m && typeof m === "object" ? (m as NicheMap) : {};
  } catch {
    return {};
  }
}

// Set a buyer's manual niche tags (empty array clears them). Reserved-Resource upsert.
export async function setBuyerNiches(contactId: string, nicheIds: string[]): Promise<void> {
  const valid = new Set(NICHES.map((n) => n.id));
  const clean = Array.from(new Set(nicheIds.filter((id) => valid.has(id))));
  const row = await db.resource.findFirst({ where: { category: CAT } });
  const map: NicheMap = row ? (() => { try { return JSON.parse(row.description || "{}"); } catch { return {}; } })() : {};
  if (clean.length) map[contactId] = clean;
  else delete map[contactId];
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "buyer-niches", category: CAT, url: "", description } });
}

// A buyer's effective niches: manual tags if any, else auto-suggested from their buy-box text.
export function effectiveNiches(row: Record<string, unknown>, manual: NicheMap): { ids: string[]; manual: boolean } {
  const id = String(row.id ?? "");
  const m = manual[id];
  if (m && m.length) return { ids: m, manual: true };
  const hay = [row.type, row.category, row.company, row.dealType, row.buildType, row.propertyType,
    row.buyBox, row.buyBoxAreas, row.marketDetails, row.notes, row.conditionTolerance, row.companySize]
    .map((x) => String(x ?? "")).join(" ");
  return { ids: suggestNichesFromText(hay), manual: false };
}

export type NicheMatch = { id: string; name: string; manual: boolean };

// Build { nicheId -> matched vetted buyers } for the Niche Playbook tab.
export function buildNicheMatches(
  rows: { id: string; name: string; [k: string]: unknown }[],
  manual: NicheMap,
): Record<string, NicheMatch[]> {
  const out: Record<string, NicheMatch[]> = {};
  for (const r of rows) {
    const { ids, manual: isManual } = effectiveNiches(r, manual);
    for (const nid of ids) {
      (out[nid] ??= []).push({ id: r.id, name: r.name, manual: isManual });
    }
  }
  return out;
}
