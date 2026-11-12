import "server-only";
// 📄 Pulled-list batches (Jon 2026-11-11): upload a pulled lead CSV (with lat/lng) into the map to
// SEE exactly where the pull is + auto-mark those areas pulled — WITHOUT importing to the CRM. Stored
// as reserved Resource JSON (no migration). Points kept compact ([lat,lng] pairs) + capped so the
// store can't bloat. Conversion tracking (how many became CRM leads) is a later phase.
import { db } from "@/lib/db";

const CAT = "__pull_lists__";
// Keep the store LIGHT so a big 10k-pull month never overloads: we EVENLY SAMPLE the pins down to
// MAX_PTS (preserves the footprint, just thinned), keep the full `count` + all ZIPs, and cap batches.
const MAX_PTS = 3500;    // display pins per batch (sampled) — shows where it's all at, stays small
const MAX_BATCHES = 10;  // keep the most recent N
export const PULL_COOLDOWN_DAYS = 90; // recommended wait before re-pulling an area (Jon 2026-11-11)

export type PullBatch = {
  id: string; name: string; at: string; by: string;
  count: number;            // total rows in the upload (the real pull size)
  zips: string[];           // unique ZIPs in the list (drives coverage + cooldown)
  pts: [number, number][];  // [lat, lng] (rounded ~1m) — an even SAMPLE of the properties (≤ MAX_PTS)
};

const newId = () => Math.random().toString(36).slice(2, 10);

export async function readPullLists(): Promise<PullBatch[]> {
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    const list = row?.description ? JSON.parse(row.description) : [];
    return Array.isArray(list) ? (list as PullBatch[]).filter((b) => b && b.id) : [];
  } catch { return []; }
}

async function writePullLists(list: PullBatch[]): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  const description = JSON.stringify(list.slice(0, MAX_BATCHES));
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "pull-lists", category: CAT, url: "", description } });
}

export async function addPullBatch(input: { name: string; by: string; count: number; zips: string[]; pts: [number, number][] }): Promise<PullBatch> {
  const valid = (input.pts || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  // EVEN sample down to MAX_PTS (every Nth) so the footprint is preserved, not cropped to the first N.
  const step = valid.length > MAX_PTS ? Math.ceil(valid.length / MAX_PTS) : 1;
  const sampled = valid.filter((_, i) => i % step === 0).slice(0, MAX_PTS).map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5] as [number, number]);
  const batch: PullBatch = {
    id: newId(),
    name: (input.name || "Pulled list").trim().slice(0, 80),
    at: new Date().toISOString().slice(0, 10),
    by: input.by || "—",
    count: Math.max(valid.length, Math.round(input.count || valid.length)),
    zips: [...new Set((input.zips || []).map((z) => String(z).replace(/\D/g, "").slice(0, 5)).filter((z) => z.length === 5))].slice(0, 500),
    pts: sampled,
  };
  const list = await readPullLists();
  await writePullLists([batch, ...list]);
  return batch;
}

/** Days left on the 90-day re-pull cooldown for a batch pulled on `at` (YYYY-MM-DD); 0 = clear. */
export function pullCooldownLeft(at: string): number {
  const end = new Date(`${at}T00:00:00`); end.setDate(end.getDate() + PULL_COOLDOWN_DAYS);
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
}

export async function removePullBatch(id: string): Promise<void> {
  const list = (await readPullLists()).filter((b) => b.id !== id);
  await writePullLists(list);
}

// ── Conversion tracking (Phase 2, Jon 2026-11-11) ───────────────────────────────────────────────
// We DON'T import the pull list into the CRM — but once a seller from that area calls/texts in and a
// rep makes them a CRM lead, we attribute them back to the pull that likely sourced them: the lead's
// address ZIP is in the batch's ZIPs AND the lead was created ON/AFTER the pull date. Each lead is
// credited to the MOST RECENT qualifying pull (so a ZIP pulled twice doesn't double-count). This turns
// a raw pull into a funnel: Pulled → CRM lead → Contract sent → Closed ($), per batch.
export type PullConv = { leads: number; offersMade: number; contractSent: number; closed: number; value: number };
export type ConvOpp = { zip: string | null; createdMs: number; stage: string; value: number };

export function attributePullConversion(batches: PullBatch[], opps: ConvOpp[]): Record<string, PullConv> {
  const out: Record<string, PullConv> = {};
  for (const b of batches) out[b.id] = { leads: 0, offersMade: 0, contractSent: 0, closed: 0, value: 0 };
  // Most-recent pull first, so .find() credits the latest pull that could have sourced the lead.
  const prepared = batches
    .map((b) => ({ id: b.id, atMs: Date.parse(`${b.at}T00:00:00Z`) || 0, zips: new Set(b.zips || []) }))
    .sort((a, c) => c.atMs - a.atMs);
  for (const o of opps) {
    if (!o.zip) continue;
    const hit = prepared.find((p) => p.atMs <= o.createdMs && p.zips.has(o.zip!));
    if (!hit) continue;
    const s = out[hit.id];
    s.leads++;
    const won = /won|closed|signed|sold/i.test(o.stage) && !/dead|lost|nurtur/i.test(o.stage);
    const contract = won || /contract/i.test(o.stage);
    // 💵 Offer made = reached (or passed) an offer stage — a key "is this market responding to our
    // SMS?" signal (Jon 2026-11-11). Offer precedes contract, so contract/won count as offered too.
    const offered = contract || /\boffer\b|verbal|negotiat/i.test(o.stage);
    if (offered) s.offersMade++;
    if (contract) s.contractSent++;
    if (won) { s.closed++; s.value += o.value || 0; }
  }
  return out;
}
