// 💸 Telnyx spend tracker (Jon 2026-11-02). Telnyx auto-recharges to $100 whenever the balance
// runs below $0, so "how often does it recharge?" = our real burn rate. There's no clean Telnyx
// API for recharge history, so we SAMPLE the live balance (/v2/balance) over time and read the
// spend off the curve: every drop is spend, every ~$100 jump up is a recharge.
//
// No schema change — the samples live in Resource category "__telnyx_balance__".
import { db } from "./db";

const CAT = "__telnyx_balance__";
const MAX_SNAPS = 600;              // ~weeks of 20-min samples; trims oldest beyond this
const MIN_GAP_MS = 18 * 60 * 1000;  // don't sample more than ~every 18 min (presence pings are frequent)
const RECHARGE_MIN = 10;            // a balance jump up of ≥ $10 counts as an auto-recharge event

export type BalanceSnap = { at: string; bal: number };
export type TelnyxBalance = { balance: number; availableCredit: number; creditLimit: number; currency: string };

/** Live balance from Telnyx. null if no API key or the call fails. */
export async function getTelnyxBalance(): Promise<TelnyxBalance | null> {
  if (!process.env.TELNYX_API_KEY) return null;
  try {
    const r = await fetch("https://api.telnyx.com/v2/balance", {
      headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { balance?: string; available_credit?: string; credit_limit?: string; currency?: string } };
    const d = j.data ?? {};
    const num = (s: string | undefined) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };
    return {
      balance: num(d.balance),
      availableCredit: num(d.available_credit),
      creditLimit: num(d.credit_limit),
      currency: d.currency || "USD",
    };
  } catch { return null; }
}

async function readRow() {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  let snaps: BalanceSnap[] = [];
  try { snaps = row?.description ? (JSON.parse(row.description) as BalanceSnap[]) : []; } catch { snaps = []; }
  if (!Array.isArray(snaps)) snaps = [];
  return { row, snaps };
}

export async function readSnaps(): Promise<BalanceSnap[]> {
  return (await readRow()).snaps;
}

/** Fetch the live balance and append a sample — throttled so frequent callers (presence pings)
 *  don't hammer it. Pass force=true for an on-demand refresh. Returns the live balance (or null). */
export async function snapshotTelnyxBalance(force = false): Promise<TelnyxBalance | null> {
  const { row, snaps } = await readRow();
  const last = snaps[snaps.length - 1];
  if (!force && last && Date.now() - new Date(last.at).getTime() < MIN_GAP_MS) {
    // too soon — skip the API call entirely
    return null;
  }
  const bal = await getTelnyxBalance();
  if (!bal) return null;
  const next = [...snaps, { at: new Date().toISOString(), bal: bal.balance }].slice(-MAX_SNAPS);
  const description = JSON.stringify(next);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { category: CAT, title: "telnyx-balance", url: "", description } });
  return bal;
}

export type SpendRecharge = { at: string; amount: number };
export type SpendReport = {
  samples: number;
  firstAt: string | null;
  lastAt: string | null;
  windowDays: number;
  recharges: SpendRecharge[];
  rechargeCount: number;
  totalSpend: number;        // $ consumed across the covered window
  perDay: number;            // avg $/day
  perWeek: number;
  perMonth: number;          // projected 30-day spend
  cadenceDays: number | null; // avg days between $100 auto-recharges (null if none yet)
  startBal: number | null;
  endBal: number | null;
};

/** 💸 Spend for ONE local day (org timezone), read off the balance curve — the number behind the
 *  single end-of-day "today's shift spend" post (Jon 2026-11-13). Reuses the same recharge-aware
 *  analyzer the /admin/telnyx page trusts; just scoped to the snapshots taken on that calendar day. */
export function spendForLocalDay(snaps: BalanceSnap[], tz = "America/Los_Angeles", day?: string): SpendReport {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const target = day || fmt.format(new Date());
  const todays = snaps.filter((s) => { try { return fmt.format(new Date(s.at)) === target; } catch { return false; } });
  return analyzeTelnyxSpend(todays);
}

/** Read the burn rate off the sampled balance curve. */
export function analyzeTelnyxSpend(snaps: BalanceSnap[]): SpendReport {
  const s = [...snaps].sort((a, b) => a.at.localeCompare(b.at));
  const empty: SpendReport = {
    samples: s.length, firstAt: s[0]?.at ?? null, lastAt: s[s.length - 1]?.at ?? null,
    windowDays: 0, recharges: [], rechargeCount: 0, totalSpend: 0, perDay: 0, perWeek: 0, perMonth: 0,
    cadenceDays: null, startBal: s[0]?.bal ?? null, endBal: s[s.length - 1]?.bal ?? null,
  };
  if (s.length < 2) return empty;
  const recharges: SpendRecharge[] = [];
  let upJumps = 0;
  for (let i = 1; i < s.length; i++) {
    const delta = s[i].bal - s[i - 1].bal;
    if (delta >= RECHARGE_MIN) { recharges.push({ at: s[i].at, amount: Math.round(delta * 100) / 100 }); upJumps += delta; }
  }
  const startBal = s[0].bal, endBal = s[s.length - 1].bal;
  // End = Start + recharges − spend  →  spend = Start − End + recharges.
  const totalSpend = Math.max(0, Math.round((startBal - endBal + upJumps) * 100) / 100);
  const ms = new Date(s[s.length - 1].at).getTime() - new Date(s[0].at).getTime();
  const windowDays = ms / 86_400_000;
  const perDay = windowDays > 0 ? totalSpend / windowDays : 0;
  return {
    samples: s.length, firstAt: s[0].at, lastAt: s[s.length - 1].at,
    windowDays: Math.round(windowDays * 10) / 10,
    recharges, rechargeCount: recharges.length,
    totalSpend,
    perDay: Math.round(perDay * 100) / 100,
    perWeek: Math.round(perDay * 7 * 100) / 100,
    perMonth: Math.round(perDay * 30 * 100) / 100,
    cadenceDays: recharges.length > 0 && windowDays > 0 ? Math.round((windowDays / recharges.length) * 10) / 10 : null,
    startBal, endBal,
  };
}

// 🔎 Team comms VERIFICATION breakdown (Jon 2026-11-19: "Telnyx will be our verification — show
// usage from Direct REI and War Room"). Telnyx's detail_records has no messaging-profile FILTER,
// so we page the window's records (capped) and group by the `profile_name` each record carries —
// giving per-channel count + SPEND + in/out, which is what "usage from Direct REI vs War Room"
// means. Carrier-level: inbound + outbound, per billed segment. Grand total comes from
// meta.total_results (exact even when the per-channel scan is capped on a huge campaign day).
type TxRec = { profile_name?: string; profile_id?: string; cost?: string; direction?: string; billed_sec?: number; duration?: number; call_sec?: number; connection_name?: string };
export type CommsChannel = { name: string; count: number; cost: number; inbound: number; outbound: number };
export type CommsCallChannel = { name: string; calls: number; outbound: number; connected: number; talkSec: number; cost: number };
export type CommsBreakdown = {
  messages: { total: number; scanned: number; partial: boolean; cost: number; byChannel: CommsChannel[] };
  // Calls come from the `sip-trunking` record type — one record per billed call — NOT `call-control`,
  // which only sees a tiny slice (Jon 2026-11-19: CDR proved the real calls are SIP-trunking/WebRTC).
  calls: { total: number; scanned: number; partial: boolean; cost: number; outbound: number; connected: number; talkSec: number; byConnection: CommsCallChannel[] };
};
const prettyConn = (n: string) => /directrei|direct rei/i.test(n) ? "Direct REI" : /browser dialer/i.test(n) ? "War Room (browser dialer)" : /war room inbound/i.test(n) ? "War Room (inbound / click-to-call)" : (n || "(unknown)");
export async function telnyxCommsBreakdown(startISO: string, endISO: string): Promise<CommsBreakdown | null> {
  const key = process.env.TELNYX_API_KEY;
  if (!key) return null;
  const page = async (recordType: string, dateField: string, maxPages: number): Promise<{ rows: TxRec[]; total: number; partial: boolean }> => {
    let p = 1, total = 0, partial = false;
    const rows: TxRec[] = [];
    while (p <= maxPages) {
      const qs = `filter[record_type]=${encodeURIComponent(recordType)}&filter[${dateField}][gte]=${encodeURIComponent(startISO)}&filter[${dateField}][lt]=${encodeURIComponent(endISO)}&page[size]=50&page[number]=${p}`;
      let body: { data?: TxRec[]; meta?: { total_results?: number; total_pages?: number } } = {};
      try {
        const r = await fetch(`https://api.telnyx.com/v2/detail_records?${qs}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!r.ok) break;
        body = await r.json();
      } catch { break; }
      const data = body.data ?? [];
      total = body.meta?.total_results ?? total;
      rows.push(...data);
      const totalPages = body.meta?.total_pages ?? 1;
      if (p >= totalPages || data.length === 0) break;
      if (p >= maxPages) { partial = true; break; }
      p++;
    }
    return { rows, total, partial };
  };
  const num = (s: unknown) => Math.abs(parseFloat(String(s ?? "0"))) || 0;
  const [msg, call] = await Promise.all([page("messaging", "created_at", 30), page("sip-trunking", "started_at", 20)]);
  const byName = new Map<string, CommsChannel>();
  let msgCost = 0;
  for (const m of msg.rows) {
    const name = (m.profile_name && m.profile_name.trim()) || (m.profile_id ? `Profile ${m.profile_id.slice(0, 8)}…` : "(unlabeled)");
    const c = num(m.cost); msgCost += c;
    const ch = byName.get(name) ?? { name, count: 0, cost: 0, inbound: 0, outbound: 0 };
    ch.count++; ch.cost += c;
    if (m.direction === "inbound") ch.inbound++; else ch.outbound++;
    byName.set(name, ch);
  }
  const callDur = (c: TxRec) => Number(c.billed_sec ?? c.duration ?? c.call_sec ?? 0) || 0;
  const byConn = new Map<string, CommsCallChannel>();
  let callCost = 0, connected = 0, outbound = 0, talkSec = 0;
  for (const c of call.rows) {
    const cost = num(c.cost), dur = callDur(c), isOut = c.direction !== "inbound", isConn = dur > 0;
    callCost += cost; talkSec += dur; if (isConn) connected++; if (isOut) outbound++;
    const name = prettyConn((c.connection_name ?? "").trim());
    const ch = byConn.get(name) ?? { name, calls: 0, outbound: 0, connected: 0, talkSec: 0, cost: 0 };
    ch.calls++; if (isOut) ch.outbound++; if (isConn) ch.connected++; ch.talkSec += dur; ch.cost += cost;
    byConn.set(name, ch);
  }
  const byConnection = [...byConn.values()].sort((a, b) => b.calls - a.calls).map((ch) => ({ ...ch, cost: Number(ch.cost.toFixed(4)) }));
  const byChannel = [...byName.values()].sort((a, b) => b.count - a.count).map((ch) => ({ ...ch, cost: Number(ch.cost.toFixed(4)) }));
  return {
    messages: { total: msg.total || msg.rows.length, scanned: msg.rows.length, partial: msg.partial, cost: Number(msgCost.toFixed(4)), byChannel },
    calls: { total: call.total || call.rows.length, scanned: call.rows.length, partial: call.partial, cost: Number(callCost.toFixed(4)), outbound, connected, talkSec, byConnection },
  };
}
