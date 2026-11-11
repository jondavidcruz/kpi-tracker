import { db } from "@/lib/db";

// 📵 Per-line DAILY outbound volume vs a carrier-safe ceiling (Jon 2026-11-11) — so a number never
// gets over-dialed/over-texted into a spam flag. Counts today's (PT) outbound calls (CrmEvent kind
// "call", meta.from = the line) + outbound texts (kind "sms", meta.line). Caps are tunable by env.
export const CALL_SAFE_CAP = Math.max(1, Number(process.env.LINE_CALL_CAP) || 125);
export const TEXT_SAFE_CAP = Math.max(1, Number(process.env.LINE_TEXT_CAP) || 150);

const d10 = (n: string) => (n || "").replace(/\D/g, "").slice(-10);

export type LineUsage = { calls: number; texts: number; callCap: number; textCap: number; tone: "good" | "warn" | "bad" };

/** Tally today's outbound call + text volume for each of `numbers`. Best-effort; never throws. */
export async function lineUsageToday(numbers: string[]): Promise<Record<string, LineUsage>> {
  const ptYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const start = new Date(`${ptYmd}T00:00:00-07:00`);
  const out: Record<string, LineUsage> = {};
  for (const n of numbers) out[d10(n)] = { calls: 0, texts: 0, callCap: CALL_SAFE_CAP, textCap: TEXT_SAFE_CAP, tone: "good" };
  if (!numbers.length) return out;
  let events: { kind: string; body: string; meta: unknown }[] = [];
  try {
    events = await db.crmEvent.findMany({
      where: { kind: { in: ["call", "sms"] }, at: { gte: start } },
      select: { kind: true, body: true, meta: true }, take: 20000,
    });
  } catch { events = []; }
  for (const e of events) {
    const m = e.meta as { line?: string; from?: string; dir?: string } | null;
    if (e.kind === "sms") {
      // only OUTBOUND texts count toward our send volume; inbound (⬅ Seller) never does
      const outbound = m?.dir === "outbound" || e.body.startsWith("➡");
      if (!outbound) continue;
      const line = m?.line ? d10(m.line) : "";
      if (line && out[line]) out[line].texts++;
    } else {
      // calls store the line in meta.from; fall back to parsing "… from +1XXXXXXXXXX"
      let line = m?.from ? d10(m.from) : "";
      if (!line) { const mm = e.body.match(/from \+?1?(\d{10})/); if (mm) line = mm[1]; }
      if (line && out[line]) out[line].calls++;
    }
  }
  for (const k of Object.keys(out)) {
    const u = out[k];
    const worst = Math.max(u.calls / u.callCap, u.texts / u.textCap);
    u.tone = worst >= 1 ? "bad" : worst >= 0.7 ? "warn" : "good";
  }
  return out;
}

/** True when this line has hit its carrier-safe ceiling for the given channel today. */
export function lineAtCap(u: LineUsage | undefined, channel: "call" | "sms"): boolean {
  if (!u) return false;
  return channel === "call" ? u.calls >= u.callCap : u.texts >= u.textCap;
}
