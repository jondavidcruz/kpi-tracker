// ☎️ Live vs. porting Telnyx numbers (Jon 2026-10-21). While numbers are mid-port
// from GHL/Twilio → Telnyx they SHOW in the account but still belong to the old
// carrier: inbound rings GHL, and outbound from one of them drops. So the War Room
// must only ever CALL/TEXT from a number that is genuinely live on Telnyx right now
// (status === "active" AND not on the porting exclusion list). The exclusion list is
// time-boxed — once the port completes the entries lapse on their own, so the newly
// active numbers start getting used with zero cleanup.
import { db } from "./db";

const PORTING_CAT = "__telnyx_porting__";

export type PortingEntry = { number: string; until: string; note?: string };

export const digits = (s: string) => (s || "").replace(/\D/g, "").slice(-10);

/** The numbers Freedom Offers is porting into Telnyx right now (from the Telnyx
 *  porting requests Jon shared 2026-10-21). Seeds the Resource store on first read;
 *  `until` is the day the port is expected to finish — after it, the number is no
 *  longer excluded and becomes a usable War Room line automatically. */
const PORTING_SEED: PortingEntry[] = [
  { number: "+12107918406", until: "2026-10-25", note: "GHL→Telnyx port (batch of 7)" },
  { number: "+15617097654", until: "2026-10-25", note: "GHL→Telnyx port (batch of 7)" },
  { number: "+16193295883", until: "2026-10-25", note: "GHL→Telnyx port (batch of 7)" },
  { number: "+16292901781", until: "2026-10-25", note: "GHL→Telnyx port (batch of 7)" },
  { number: "+19048677659", until: "2026-10-25", note: "GHL→Telnyx port (batch of 7)" },
  { number: "+19188183060", until: "2026-10-25", note: "GHL→Telnyx port (batch of 7)" },
  { number: "+19283251723", until: "2026-10-25", note: "GHL→Telnyx port (batch of 7)" },
  { number: "+18776528991", until: "2026-10-25", note: "GHL→Telnyx toll-free port" },
];

/** Read the porting list (seeds it on first ever read). Never throws. */
export async function readPorting(): Promise<PortingEntry[]> {
  try {
    const row = await db.resource.findFirst({ where: { category: PORTING_CAT } });
    if (!row) {
      await db.resource.create({ data: { title: "telnyx-porting", category: PORTING_CAT, url: "", description: JSON.stringify(PORTING_SEED) } });
      return PORTING_SEED;
    }
    const list = JSON.parse(row.description || "[]");
    return Array.isArray(list) ? (list as PortingEntry[]).filter((e) => e && e.number) : [];
  } catch { return PORTING_SEED; }
}

/** The set of 10-digit numbers that are STILL mid-port today (excluded from use). */
export async function portingDigitsNow(todayIso?: string): Promise<Set<string>> {
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  const list = await readPorting();
  return new Set(list.filter((e) => !e.until || today <= e.until).map((e) => digits(e.number)));
}

export type TelnyxNumber = { number: string; status: string; connection: string; msgProfile: boolean };

/** Every number on the Telnyx account, live from the API. Empty on any failure. */
export async function listTelnyxNumbers(): Promise<TelnyxNumber[]> {
  if (!process.env.TELNYX_API_KEY) return [];
  try {
    const res = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=250", {
      headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json()) as { data?: Array<{ phone_number?: string; connection_name?: string; messaging_profile_id?: string | null; status?: string }> };
    return (body.data ?? []).map((n) => ({ number: n.phone_number ?? "", status: n.status ?? "?", connection: n.connection_name ?? "—", msgProfile: Boolean(n.messaging_profile_id) })).filter((n) => n.number);
  } catch { return []; }
}

/** Numbers you can actually call/text from RIGHT NOW: active on Telnyx and not
 *  mid-port. `porting` lists the ones held back so the UI can show them apart. */
export async function partitionNumbers(): Promise<{ live: TelnyxNumber[]; porting: TelnyxNumber[]; unknownToApi: string[] }> {
  const [all, excluded] = await Promise.all([listTelnyxNumbers(), portingDigitsNow()]);
  const live: TelnyxNumber[] = [];
  const porting: TelnyxNumber[] = [];
  const seen = new Set<string>();
  for (const n of all) {
    seen.add(digits(n.number));
    if (excluded.has(digits(n.number)) || n.status !== "active") porting.push(n);
    else live.push(n);
  }
  // porting numbers on the exclusion list that the API doesn't even surface yet
  const unknownToApi = [...excluded].filter((d) => !seen.has(d));
  return { live, porting, unknownToApi };
}

/** Pick the caller ID the dialer should originate from: the preferred number IF it's
 *  live, else the first live number (prefer one on the War Room connection). Returns
 *  active:false when nothing is confirmed live so callers can surface a clear warning
 *  instead of silently dialing from a dead/porting line. */
export async function pickWorkingCallerId(preferred?: string): Promise<{ callerId: string; active: boolean; live: string[]; porting: string[] }> {
  const { live, porting } = await partitionNumbers();
  const liveNums = live.map((n) => n.number);
  const portNums = porting.map((n) => n.number);
  const prefD = digits(preferred ?? "");
  if (prefD && live.some((n) => digits(n.number) === prefD)) return { callerId: preferred!, active: true, live: liveNums, porting: portNums };
  // prefer a live number already wired to the War Room voice connection
  const warRoom = live.find((n) => /war room/i.test(n.connection));
  const pick = warRoom?.number || liveNums[0] || "";
  if (pick) return { callerId: pick, active: true, live: liveNums, porting: portNums };
  // nothing confirmed live — fall back to the preferred so we don't break mid-port,
  // but flag it as unverified
  return { callerId: preferred ?? "", active: false, live: liveNums, porting: portNums };
}
