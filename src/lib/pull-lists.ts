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
