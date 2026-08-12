// Maps app records → their PRIVATE Google Drive file id, so heavy binary blobs
// (HUD statements, HR docs) live in Drive instead of bloating Postgres. Stored as
// one JSON row in Resource (category __drive_files__) — no schema migration.
// Keys are namespaced: "hud:<closedDealId>" and "doc:<teamDocId>".
import { db } from "./db";

const CAT = "__drive_files__";
type DriveMap = Record<string, string>;

export async function readDriveMap(): Promise<DriveMap> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row) return {};
  try { return JSON.parse(row.description || "{}"); } catch { return {}; }
}
async function writeDriveMap(map: DriveMap) {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify(map) } });
  else await db.resource.create({ data: { title: "drive-files", category: CAT, url: "", description: JSON.stringify(map) } });
}
export async function setDriveFile(key: string, fileId: string) {
  const map = await readDriveMap();
  map[key] = fileId;
  await writeDriveMap(map);
}
export async function getDriveFile(key: string): Promise<string | null> {
  const map = await readDriveMap();
  return map[key] ?? null;
}
