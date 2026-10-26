import { db } from "@/lib/db";

// 🔄 SMS from-number rotation (Jon 2026-10-26): when a carrier rejects an outbound text
// (common right after a port, before 10DLC fully settles), auto-resend it from a different
// known-good War Room number instead of silently failing. Capped so it can't loop.

const POOL_CAT = "__sms_pool__";
const ROT_CAT = "__sms_rotations__";
const MAX_TRIES = 3; // the failed number + up to 2 rotations

async function msgProfileId(): Promise<string> {
  const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } }).catch(() => null);
  try { return (row?.description ? JSON.parse(row.description) : {}).msgProfileId || ""; } catch { return ""; }
}

/** The SMS-capable War Room numbers (all on the "War Room SMS" messaging profile), cached 1h.
 *  Falls back to the TELNYX_SMS_POOL / TELNYX_SMS_FROM env if the API/profile is unavailable. */
export async function smsFromPool(): Promise<string[]> {
  const row = await db.resource.findFirst({ where: { category: POOL_CAT } }).catch(() => null);
  if (row?.description) {
    try { const d = JSON.parse(row.description); if (d.at && Date.now() - Date.parse(d.at) < 3600_000 && Array.isArray(d.nums) && d.nums.length) return d.nums; } catch { /* refetch */ }
  }
  const envPool = () => (process.env.TELNYX_SMS_POOL || process.env.TELNYX_SMS_FROM || "").split(",").map((s) => s.trim()).filter(Boolean);
  const key = process.env.TELNYX_API_KEY;
  const prof = await msgProfileId();
  if (!key || !prof) return envPool();
  try {
    const r = await fetch(`https://api.telnyx.com/v2/phone_numbers?filter[messaging_profile_id]=${prof}&page[size]=100`, { headers: { Authorization: `Bearer ${key}` } });
    const j = (await r.json()) as { data?: Array<{ phone_number?: string }> };
    const nums = (j.data ?? []).map((x) => x.phone_number).filter((x): x is string => !!x);
    if (nums.length) {
      const description = JSON.stringify({ at: new Date().toISOString(), nums });
      if (row) await db.resource.update({ where: { id: row.id }, data: { description } }).catch(() => {});
      else await db.resource.create({ data: { title: "sms-pool", category: POOL_CAT, url: "", description } }).catch(() => {});
      return nums;
    }
    return envPool();
  } catch { return envPool(); }
}

async function saveRot(rowId: string | null, map: unknown): Promise<void> {
  const description = JSON.stringify(map);
  if (rowId) await db.resource.update({ where: { id: rowId }, data: { description } }).catch(() => {});
  else await db.resource.create({ data: { title: "sms-rotations", category: ROT_CAT, url: "", description } }).catch(() => {});
}

/** A text to `to` failed from `failedFrom` — resend it from the next known-good number.
 *  Tracks the numbers already tried per (recipient, message) so it stops after MAX_TRIES
 *  or when the pool is exhausted. */
export async function rotateAndResend(to: string, text: string, failedFrom: string): Promise<{ resent: boolean; from?: string; exhausted?: boolean }> {
  const key = process.env.TELNYX_API_KEY;
  const to10 = (to || "").replace(/\D/g, "").slice(-10);
  if (!key || to10.length !== 10 || !text.trim()) return { resent: false };
  const sig = `${to10}|${text.slice(0, 60)}`;
  const row = await db.resource.findFirst({ where: { category: ROT_CAT } }).catch(() => null);
  let map: Record<string, { tried: string[]; at: string }> = {};
  try { map = row?.description ? JSON.parse(row.description) : {}; } catch { map = {}; }
  const cutoff = Date.now() - 2 * 3600_000;
  for (const k of Object.keys(map)) if (Date.parse(map[k].at) < cutoff) delete map[k];
  const state = map[sig] ?? { tried: [], at: new Date().toISOString() };
  if (failedFrom && !state.tried.includes(failedFrom)) state.tried.push(failedFrom);

  if (state.tried.length >= MAX_TRIES) { map[sig] = state; await saveRot(row?.id ?? null, map); return { resent: false, exhausted: true }; }
  const pool = await smsFromPool();
  const next = pool.find((n) => !state.tried.includes(n) && n.replace(/\D/g, "").slice(-10) !== to10);
  if (!next) { map[sig] = state; await saveRot(row?.id ?? null, map); return { resent: false, exhausted: true }; }

  try {
    const r = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: next, to, text }),
    });
    state.tried.push(next); state.at = new Date().toISOString(); map[sig] = state; await saveRot(row?.id ?? null, map);
    return r.ok ? { resent: true, from: next } : { resent: false };
  } catch { state.tried.push(next); map[sig] = state; await saveRot(row?.id ?? null, map); return { resent: false }; }
}
