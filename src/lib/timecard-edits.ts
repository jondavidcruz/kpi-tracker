// Verification trail for non-C-suite time edits (Jon 2026-10-07: Marie can
// edit the time card, but her edits need Jon/Viktoriia sign-off). Stored as a
// JSON list in Resource __timecard_edits__, newest first, capped at 200.
import { db } from "./db";

export const TIMECARD_EDITS_CAT = "__timecard_edits__";
export type TimecardEdit = { id: string; at: string; by: string; action: string; detail: string; verifiedBy?: string; verifiedAt?: string };

export async function readTimecardEdits(): Promise<TimecardEdit[]> {
  const row = await db.resource.findFirst({ where: { category: TIMECARD_EDITS_CAT } }).catch(() => null);
  try { return JSON.parse(row?.description || "[]"); } catch { return []; }
}
