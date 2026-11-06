// ✅ Appointment "done" state WITHOUT a schema column (Jon 2026-11-05: "make a mark-done
// for appts like tasks"). CrmAppointment has no doneAt field, and adding one is a Prisma
// migration — which silently fails on this setup (DIRECT_URL unreachable) and would take
// the site down. So done appointments live in a reserved Resource JSON set, same
// no-migration pattern as __appt_done__'s cousins (__speed_checks__, __land_comps__,
// __cascade_auto__). A done appt stops illuminating the card red and stops popping up.
import { db } from "@/lib/db";

const CAT = "__appt_done__";
const MAX = 4000; // ring-cap so the row can't grow forever

type DoneMap = Record<string, { by: string; at: string }>;

async function read(): Promise<DoneMap> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row) return {};
  try { return JSON.parse(row.description || "{}"); } catch { return {}; }
}

/** Set of appointment ids that have been marked done. */
export async function readApptDone(): Promise<Set<string>> {
  return new Set(Object.keys(await read()));
}

/** Mark one appointment done (idempotent). */
export async function markApptDone(id: string, by: string): Promise<void> {
  if (!id) return;
  const row = await db.resource.findFirst({ where: { category: CAT } });
  let m: DoneMap = {};
  try { m = JSON.parse(row?.description || "{}"); } catch { /* fresh */ }
  if (!m[id]) m[id] = { by, at: new Date().toISOString() };
  // Ring-cap: drop the oldest when over the limit.
  const keys = Object.keys(m);
  if (keys.length > MAX) {
    keys.sort((a, b) => Date.parse(m[a].at) - Date.parse(m[b].at));
    for (const k of keys.slice(0, keys.length - MAX)) delete m[k];
  }
  const description = JSON.stringify(m);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "appt-done", category: CAT, url: "", description } });
}
