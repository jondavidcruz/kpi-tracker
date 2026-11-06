// 🖍 Hand-drawn map territories (Jon 2026-11-05: "write on the map — mark areas we're
// marketing in / have pulled leads in vs uncharted"). The owner draws polygons on the Halo
// map; each is saved as a status + a list of [lat,lng] points in reserved Resource JSON
// (__map_territories__) — no schema, one small row, infra-light. Rendered as colored,
// labeled overlays so the map becomes a living fog-of-war of where we operate.
import { db } from "@/lib/db";

export type TerrStatus = "pulled" | "marketing" | "target" | "avoid";
export const TERR_META: Record<TerrStatus, { label: string; color: string; emoji: string }> = {
  pulled:    { label: "Pulled leads", color: "#f59e0b", emoji: "📥" },
  marketing: { label: "Marketing now", color: "#3b82f6", emoji: "📣" },
  target:    { label: "Target / to pull", color: "#10b981", emoji: "🎯" },
  avoid:     { label: "Avoid / saturated", color: "#ef4444", emoji: "⛔" },
};

export type Territory = {
  id: string;
  name: string;
  status: TerrStatus;
  points: [number, number][]; // [lat, lng] ring
  by: string;
  at: string;
};

const CAT = "__map_territories__";
const MAX_TERR = 200;
const MAX_POINTS = 400; // cap a single polygon's vertices so the row stays small

function id(): string { return Math.random().toString(36).slice(2, 10); }

export async function readTerritories(): Promise<Territory[]> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row?.description) return [];
  try { const l = JSON.parse(row.description); return Array.isArray(l) ? (l as Territory[]) : []; } catch { return []; }
}

async function write(list: Territory[]): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  const description = JSON.stringify(list.slice(0, MAX_TERR));
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "map-territories", category: CAT, url: "", description } });
}

/** Add or update one territory. Returns the saved id. */
export async function saveTerritory(t: { id?: string; name: string; status: TerrStatus; points: [number, number][]; by: string }): Promise<string | null> {
  const pts = (t.points || []).filter((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, MAX_POINTS);
  if (pts.length < 3) return null; // need a real polygon
  const list = await readTerritories();
  const tid = t.id && list.some((x) => x.id === t.id) ? t.id : id();
  const entry: Territory = { id: tid, name: (t.name || "Untitled").slice(0, 80), status: t.status, points: pts, by: t.by, at: new Date().toISOString() };
  const idx = list.findIndex((x) => x.id === tid);
  if (idx >= 0) list[idx] = entry; else list.unshift(entry);
  await write(list);
  return tid;
}

export async function deleteTerritory(tid: string): Promise<void> {
  const list = await readTerritories();
  await write(list.filter((x) => x.id !== tid));
}
