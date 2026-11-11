import "server-only";
// 📄 Pulled-list batches (Jon 2026-11-11): upload a pulled lead CSV (with lat/lng) into the map to
// SEE exactly where the pull is + auto-mark those areas pulled — WITHOUT importing to the CRM. Stored
// as reserved Resource JSON (no migration). Points kept compact ([lat,lng] pairs) + capped so the
// store can't bloat. Conversion tracking (how many became CRM leads) is a later phase.
import { db } from "@/lib/db";

const CAT = "__pull_lists__";
const MAX_PTS = 6000;    // per batch — plenty to show the footprint; keeps the row small
const MAX_BATCHES = 24;  // keep the most recent N

export type PullBatch = {
  id: string; name: string; at: string; by: string;
  count: number;            // total rows in the upload (even if pts were capped)
  zips: string[];           // unique ZIPs in the list (drives coverage marking)
  pts: [number, number][];  // [lat, lng] (rounded ~1m) — the exact properties, capped at MAX_PTS
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
  const batch: PullBatch = {
    id: newId(),
    name: (input.name || "Pulled list").trim().slice(0, 80),
    at: new Date().toISOString().slice(0, 10),
    by: input.by || "—",
    count: Math.max(0, Math.round(input.count || input.pts.length)),
    zips: [...new Set((input.zips || []).map((z) => String(z).replace(/\D/g, "").slice(0, 5)).filter((z) => z.length === 5))].slice(0, 400),
    pts: (input.pts || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, MAX_PTS).map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5] as [number, number]),
  };
  const list = await readPullLists();
  await writePullLists([batch, ...list]);
  return batch;
}

export async function removePullBatch(id: string): Promise<void> {
  const list = (await readPullLists()).filter((b) => b.id !== id);
  await writePullLists(list);
}
