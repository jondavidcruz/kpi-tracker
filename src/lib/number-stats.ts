// 📊 Per-number INBOUND call stats (Jon 2026-11-05). A durable, auto-computed
// answer rate per Telnyx number — the free proxy for carrier spam-flagging: when a
// number's inbound answer rate craters, it's usually been labeled. Replaces the
// MANUAL answerRate field on /phone-health for inbound.
//
// Scope note: INBOUND only. Outbound dials are placed client-side over WebRTC and an
// UNANSWERED outbound dial never reaches our Call Control webhook, so the server can't
// see outbound attempts — that signal needs client-dialer instrumentation (separate,
// comms-critical, on a branch). Inbound is fully observable in the webhook: every
// incoming call has a definitive answered/not-answered outcome. See [[phone-health]].
//
// Storage = NO migration: one reserved Resource row, category "__number_stats__",
// JSON in `description`. Writes are best-effort and fully guarded at the call site so
// they can NEVER affect call handling (the sacred comms path).
import { db } from "@/lib/db";

const CAT = "__number_stats__";
const SEEN_CAP = 600; // recent callIds kept for dedupe (inbound volume is low)
const DAYS_CAP = 40; // rolling per-number history (self-caps the store)

type DayBucket = { calls: number; answered: number };
export type NumberStore = {
  seenCall: string[]; // callIds already counted toward `calls`
  seenAns: string[]; // callIds already counted toward `answered`
  days: Record<string, Record<string, DayBucket>>; // number(10-digit) -> "YYYY-MM-DD"(PT) -> bucket
};

const EMPTY: NumberStore = { seenCall: [], seenAns: [], days: {} };

function digits10(n: string): string {
  return (n || "").replace(/\D/g, "").slice(-10);
}
// PT (America/Los_Angeles) calendar date — pacing & daily buckets are per local day.
function ptDate(ms = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}
function lastNDates(n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < n; i++) out.add(ptDate(Date.now() - i * 86_400_000));
  return out;
}

async function load(): Promise<{ id: string | null; store: NumberStore }> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  let store: NumberStore = { ...EMPTY };
  try { if (row?.description) store = { ...EMPTY, ...(JSON.parse(row.description) as Partial<NumberStore>) }; } catch { /* fresh */ }
  if (!Array.isArray(store.seenCall)) store.seenCall = [];
  if (!Array.isArray(store.seenAns)) store.seenAns = [];
  if (!store.days || typeof store.days !== "object") store.days = {};
  return { id: row?.id ?? null, store };
}

async function save(id: string | null, store: NumberStore): Promise<void> {
  // self-cap history so the store can't grow unbounded
  for (const num of Object.keys(store.days)) {
    const dates = Object.keys(store.days[num]).sort();
    while (dates.length > DAYS_CAP) { const d = dates.shift(); if (d) delete store.days[num][d]; }
    if (Object.keys(store.days[num]).length === 0) delete store.days[num];
  }
  const description = JSON.stringify(store);
  if (id) await db.resource.update({ where: { id }, data: { description } });
  else await db.resource.create({ data: { title: "number-stats", category: CAT, url: "", description } });
}

function bucket(store: NumberStore, num10: string, date: string): DayBucket {
  const byNum = (store.days[num10] ??= {});
  return (byNum[date] ??= { calls: 0, answered: 0 });
}

/** Record one INBOUND call to our number `ourNumber`, deduped by `callId`. Best-effort. */
export async function recordInboundCall(ourNumber: string, callId: string): Promise<void> {
  const num10 = digits10(ourNumber);
  if (num10.length !== 10 || !callId) return;
  const { id, store } = await load();
  if (store.seenCall.includes(callId)) return;
  store.seenCall.push(callId);
  if (store.seenCall.length > SEEN_CAP) store.seenCall = store.seenCall.slice(-SEEN_CAP);
  bucket(store, num10, ptDate()).calls++;
  await save(id, store);
}

/** Mark an INBOUND call to `ourNumber` ANSWERED, deduped by `callId`. Best-effort. */
export async function recordInboundAnswered(ourNumber: string, callId: string): Promise<void> {
  const num10 = digits10(ourNumber);
  if (num10.length !== 10 || !callId) return;
  const { id, store } = await load();
  if (store.seenAns.includes(callId)) return;
  store.seenAns.push(callId);
  if (store.seenAns.length > SEEN_CAP) store.seenAns = store.seenAns.slice(-SEEN_CAP);
  bucket(store, num10, ptDate()).answered++;
  await save(id, store);
}

export type InboundRollup = { calls: number; answered: number; rate: number | null; today: number };

/** Read the whole store once (for a page that rolls up many numbers). */
export async function readNumberStore(): Promise<NumberStore> {
  const { store } = await load();
  return store;
}

/** Roll up inbound stats for one number over the last `days` PT days. */
export function inboundFor(store: NumberStore, number: string, days: number): InboundRollup {
  const num10 = digits10(number);
  const window = lastNDates(days);
  const todayStr = ptDate();
  let calls = 0, answered = 0, today = 0;
  const byDate = store.days[num10] ?? {};
  for (const [date, b] of Object.entries(byDate)) {
    if (window.has(date)) { calls += b.calls; answered += b.answered; }
    if (date === todayStr) today = b.calls;
  }
  return { calls, answered, rate: calls > 0 ? Math.round((answered / calls) * 100) : null, today };
}
