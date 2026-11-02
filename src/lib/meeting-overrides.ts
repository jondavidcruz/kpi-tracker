// 🏆/🗣 Owner overrides for the Monday deck — a manual Person-of-the-Week pick and a closing
// "talking point" slide (Jon 2026-11-02). Stored as ONE JSON row in Resource (category
// __meeting_overrides__) so there's no schema migration (DIRECT_URL migrations are off-limits).
import { db } from "./db";

const CAT = "__meeting_overrides__";
export type MeetingOverrides = {
  potwName: string;   // manual Person of the Week (blank = use the auto pick)
  potwNote: string;   // the line under their name (e.g. "Closed the Birch St deal")
  potwWeek: string;   // the recognition week (YYYY-MM-DD) this pick is for → auto-expires
  closingTitle: string; // closing talking-point headline (blank = default "That's the all-call")
  closingBody: string;  // the talking point Jon speaks to
};
const EMPTY: MeetingOverrides = { potwName: "", potwNote: "", potwWeek: "", closingTitle: "", closingBody: "" };

export async function readMeetingOverrides(): Promise<MeetingOverrides> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return { ...EMPTY, ...(row?.description ? JSON.parse(row.description) : {}) }; } catch { return { ...EMPTY }; }
}

export async function writeMeetingOverrides(patch: Partial<MeetingOverrides>): Promise<void> {
  const cur = await readMeetingOverrides();
  const next = { ...cur, ...patch };
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  const description = JSON.stringify(next);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { category: CAT, title: "meeting-overrides", url: "", description } });
}
