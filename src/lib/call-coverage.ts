// End-of-day check: every "money call" a rep logged should have a matching call
// recording uploaded to Call Scoring. e.g. Michelle logged 2 offer calls → expect 2
// recordings; Sharyn/Marie logged 3 developer conversations → expect 3. Posts a team
// Chat summary flagging anyone who's short on recordings so they upload before EOD.

import { db } from "./db";
import { sendTeamChat } from "./notify";
import { zonedTime } from "./shift";

// KPIs that each represent a real, recordable conversation. (High-volume dial KPIs
// like Outbound Dials / Connections are intentionally NOT here — they aren't each
// recorded.) Edit this list to change what counts as a "money call".
export const CALL_KPIS: { key: string; label: string }[] = [
  { key: "offers_made", label: "offer call" },
  { key: "completed_process_calls", label: "process call" },
  { key: "appts_taken", label: "appointment" },
  { key: "buyers_contacted", label: "developer/buyer conversation" },
  { key: "buyer_offers_received", label: "buyer offer call" },
];

const firstName = (n: string) => n.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Build + post the end-of-day "calls vs recordings" summary for `date`.
 * Returns how many people came up short on recordings.
 */
export async function sendCallCoverageChat(date: string, tz: string): Promise<{ posted: boolean; gaps: number; rows: number }> {
  const kpis = await db.kpi.findMany({ where: { key: { in: CALL_KPIS.map((c) => c.key) } }, select: { id: true, key: true } });
  if (kpis.length === 0) return { posted: false, gaps: 0, rows: 0 };
  const keyById = new Map(kpis.map((k) => [k.id, k.key]));
  const labelByKey = new Map(CALL_KPIS.map((c) => [c.key, c.label]));

  // Recordings uploaded during the org-local day [00:00, next 00:00).
  const start = zonedTime(date, 0, 0, tz);
  const nd = new Date(date + "T12:00:00Z"); nd.setUTCDate(nd.getUTCDate() + 1);
  const end = zonedTime(nd.toISOString().slice(0, 10), 0, 0, tz);

  const [reps, entries, recordings] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.entry.findMany({ where: { date, kpiId: { in: kpis.map((k) => k.id) }, userId: { not: null } }, select: { userId: true, kpiId: true, value: true } }),
    db.callScore.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { repName: true } }),
  ]);

  const recByName = new Map<string, number>();
  for (const r of recordings) { const k = firstName(r.repName); if (k) recByName.set(k, (recByName.get(k) ?? 0) + 1); }
  const nameById = new Map(reps.map((r) => [r.id, r.name]));

  // Sum each rep's logged money-calls by KPI.
  const byUser = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (!e.userId) continue;
    const key = keyById.get(e.kpiId); if (!key) continue;
    const m = byUser.get(e.userId) ?? new Map<string, number>();
    m.set(key, (m.get(key) ?? 0) + (e.value ?? 0));
    byUser.set(e.userId, m);
  }

  type Row = { name: string; total: number; uploaded: number; parts: string[] };
  const rows: Row[] = [];
  for (const [userId, counts] of byUser) {
    let total = 0; const parts: string[] = [];
    for (const c of CALL_KPIS) { const n = Math.round(counts.get(c.key) ?? 0); if (n > 0) { total += n; parts.push(plural(n, labelByKey.get(c.key)!)); } }
    if (total <= 0) continue;
    const name = nameById.get(userId) ?? "";
    rows.push({ name, total, uploaded: recByName.get(firstName(name)) ?? 0, parts });
  }
  if (rows.length === 0) return { posted: false, gaps: 0, rows: 0 };
  // Biggest shortfall first, then by name.
  rows.sort((a, b) => (b.total - b.uploaded) - (a.total - a.uploaded) || a.name.localeCompare(b.name));

  const lines = rows.map((r) => {
    const missing = r.total - r.uploaded;
    const status = missing > 0 ? `⚠️ *${plural(missing, "recording")} missing*` : "✅ all uploaded";
    return `• *${r.name.split(" ")[0]}* — ${r.parts.join(", ")} = needs ${r.total} · ${r.uploaded} uploaded · ${status}`;
  });
  const gaps = rows.filter((r) => r.total > r.uploaded).length;
  const header = gaps > 0
    ? `🎧 *End-of-day call recordings — ${date}*\nEvery money call should have a recording. ${gaps === 1 ? "1 person is" : `${gaps} people are`} short — please upload before you log off:`
    : `🎧 *End-of-day call recordings — ${date}*\n✅ Every money call has a matching recording. Nice work team:`;
  const posted = await sendTeamChat([header, ...lines].join("\n")).catch(() => false);
  return { posted: !!posted, gaps, rows: rows.length };
}
