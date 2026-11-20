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

// 🔎 Team comms VERIFICATION counts (Jon 2026-11-19: "Telnyx will be our verification" — REI Reply
// retired; Direct REI + War Room both run on Telnyx). Cheap: reads meta.total_results (one request
// each, NO record pagination). DirectREI mass-marketing is split out via its messaging profile so
// the rest (War Room CRM traffic) can be eyeballed against our own CrmEvent logs. Counts are
// carrier-level: inbound + outbound, per billed segment.
const DIRECTREI_MSG_PROFILE = "40019f8e-dc9a-4b98-8086-de9333fe6f68"; // profile_name "DirectREI"
export type CommsCounts = { messagesTotal: number; messagesDirectREI: number; messagesOther: number; splitOk: boolean; callLegs: number };
export async function telnyxCommsCounts(startISO: string, endISO: string): Promise<CommsCounts | null> {
  if (!process.env.TELNYX_API_KEY) return null;
  const count = async (recordType: string, dateField: string, extra = ""): Promise<number | null> => {
    const qs = `filter[record_type]=${encodeURIComponent(recordType)}&filter[${dateField}][gte]=${encodeURIComponent(startISO)}&filter[${dateField}][lt]=${encodeURIComponent(endISO)}${extra}&page[size]=1&page[number]=1`;
    try {
      const r = await fetch(`https://api.telnyx.com/v2/detail_records?${qs}`, { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!r.ok) return null;
      const j = (await r.json()) as { meta?: { total_results?: number } };
      return j.meta?.total_results ?? 0;
    } catch { return null; }
  };
  const [messagesTotal, direct, callLegs] = await Promise.all([
    count("messaging", "created_at"),
    count("messaging", "created_at", `&filter[messaging_profile_id]=${DIRECTREI_MSG_PROFILE}`),
    count("call-control", "started_at"),
  ]);
  const total = messagesTotal ?? 0;
  const splitOk = direct != null && direct <= total; // the profile filter is supported & sane
  const messagesDirectREI = splitOk ? (direct as number) : 0;
  return { messagesTotal: total, messagesDirectREI, messagesOther: splitOk ? Math.max(0, total - messagesDirectREI) : total, splitOk, callLegs: callLegs ?? 0 };
}
