import { db } from "./db";
import { searchConversations, getMessages, searchOpportunities } from "./reireply";

// Pipelines we read for stage-move KPIs: AQ Developer + Traditional (Michelle) and
// DS: Close Profits (Marie/Sharyn). Each opportunity is credited to its assignedTo.
const PIPELINES = ["KkdpJx35dU4cLtYY9vXP", "8R4HDQD1nUGOUxGCxuCe", "Jm90sKZNvl8e5fKparhv"];
const STAGE_KPI: Record<string, string> = {
  // 📅 APT SET (Process/Offer Call) → Appointments Set
  "48cbe48a-abbb-440f-97f8-c56e5776103d": "appts_set",
  "d405ca99-35e1-4446-8440-47aa8df1ab9e": "appts_set",
  // Process call done = card reaches comp/numbers review (per Jon)
  "276eae09-9722-434a-a47b-e97b012e7ce7": "completed_process_calls", // trad COMP TO OFFER
  "2d6a497d-625f-4d65-92b8-19f8b651d30e": "completed_process_calls", // dev REVIEW NUMBERS
  // 🧑🏻‍⚖️ COMP REVIEW (AQM) → Comps Done
  "381d0841-7ffb-4f74-8f34-cdee2cdc0868": "comps_done",
  // ⚓ VERBAL OFFER → Offers Made
  "6549e8ff-7695-4cd9-9705-e0316be52d7c": "offers_made",
  "c31d1b15-ad0f-4306-9eb3-8cce3909b7be": "offers_made",
  // 📩 CONTRACT SENT → Contracts Sent
  "28862a2e-e19d-47aa-820f-b95f6b85445c": "acq_contracts_sent",
  "eee45ef4-63ca-4941-9382-abef8ebabba4": "acq_contracts_sent",
  // 📝 CONTRACT SIGNED (Dispo) → Contracts Signed
  "e41c86fb-bf38-4aea-88aa-3e8c3f4fd7be": "contracts_signed",
  "08541c62-3363-4c2c-b04c-970b3b123399": "contracts_signed",
  // DS: Close Profits — 📣 ON MARKET → Deals Sent to Buyers
  "408fafdb-27c7-4779-a3b1-34b425f73046": "deals_sold",
};

// CRM agent → our rep, with the KPI keys each call metric feeds. Connected = a
// TYPE_CALL whose meta.call.duration ≥ convMin (so voicemails/quick no-answers
// never count as a real conversation).
type AgentCfg = { crm: string; first: string; talk: string; conv?: string; convMin?: number; dials?: string };
export const AGENTS: AgentCfg[] = [
  { crm: "Up6W3UdNQ4tDkitQfUJq", first: "jon", talk: "acq_talk_time" },
  { crm: "FT34Pug9AUHAG0Kpwg9j", first: "michelle", talk: "acq_talk_time" },
  { crm: "vFYB3vWFG2o0VOVwwEYd", first: "sharyn", talk: "ds_talk_time", conv: "dev_conversations", convMin: 90, dials: "buyers_contacted" },
  { crm: "IqYEt2UrQ6gVToOzsaaw", first: "marie", talk: "ds_talk_time", conv: "buyer_conversations", convMin: 60, dials: "buyers_contacted" },
];

// UTC ms bounds of a calendar day in `tz` (DST-safe).
function tzOffsetMs(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour === 24 ? 0 : +m.hour, +m.minute, +m.second);
  return asUTC - utcMs;
}
function dayBounds(date: string, tz: string): { start: number; end: number } {
  const naive = Date.parse(date + "T00:00:00Z");
  const start = naive - tzOffsetMs(tz, naive);
  return { start, end: start + 24 * 3600 * 1000 };
}

export type Agg = { dials: number; connected: number; talkSec: number; voicemails: number };
export type PullResult = { date: string; scanned: number; pages: number; per: Record<string, Agg> };

/** Crawl conversations + their messages for one day; aggregate call stats per agent. */
export async function pullDay(date: string, tz: string): Promise<PullResult> {
  const { start, end } = dayBounds(date, tz);
  const cfgByCrm = new Map(AGENTS.map((a) => [a.crm, a]));
  const per: Record<string, Agg> = {};
  for (const a of AGENTS) per[a.crm] = { dials: 0, connected: 0, talkSec: 0, voicemails: 0 };

  let cursor: string | undefined;
  let pages = 0;
  let scanned = 0;
  while (pages < 25) {
    pages++;
    const res = await searchConversations(cursor ? { limit: "100", startAfterDate: cursor } : { limit: "100" });
    if (!res.ok) break;
    const body = res.body as { conversations?: Array<{ id: string; lastMessageDate?: number | string }> };
    const convs = body.conversations ?? [];
    if (convs.length === 0) break;

    let anyInRange = false;
    for (const c of convs) {
      const lmd = typeof c.lastMessageDate === "number" ? c.lastMessageDate : Date.parse(String(c.lastMessageDate ?? 0));
      if (Number.isFinite(lmd) && lmd < start) continue; // last activity before our day → skip
      anyInRange = true;
      scanned++;
      const m = await getMessages(c.id);
      if (!m.ok) continue;
      const mb = m.body as { messages?: unknown[] | { messages?: unknown[] } };
      const list: unknown[] = Array.isArray(mb?.messages) ? (mb.messages as unknown[]) : ((mb?.messages as { messages?: unknown[] })?.messages ?? []);
      for (const raw of list) {
        const msg = raw as { dateAdded?: string; userId?: string; messageType?: string; status?: string; meta?: { call?: { duration?: number; status?: string } } };
        const dt = Date.parse(String(msg.dateAdded ?? 0));
        if (!(dt >= start && dt < end)) continue;
        const agg = per[String(msg.userId ?? "")];
        if (!agg) continue; // untracked agent
        const mt = String(msg.messageType ?? "");
        if (mt === "TYPE_CAMPAIGN_VOICEMAIL") { agg.voicemails++; continue; }
        if (mt !== "TYPE_CALL") continue;
        agg.dials++;
        const dur = Number(msg.meta?.call?.duration ?? 0) || 0;
        agg.talkSec += dur;
        const min = cfgByCrm.get(String(msg.userId))?.convMin ?? 60;
        if (dur >= min && (msg.meta?.call?.status ?? msg.status) === "completed") agg.connected++;
      }
    }
    const last = convs[convs.length - 1]?.lastMessageDate;
    cursor = last != null ? String(last) : undefined;
    if (!anyInRange || !cursor) break;
  }
  return { date, scanned, pages, per };
}

// --- Opportunities (stage moves → Offers Made / Contracts Sent) ----------------
export type OppPull = { date: string; counts: Record<string, number>; scanned: number; sample?: unknown };

/** Count opportunities that ENTERED an offer/contract stage on `date`, by CRM user. */
export async function pullOpps(date: string, tz: string): Promise<OppPull> {
  const { start, end } = dayBounds(date, tz);
  const counts: Record<string, number> = {}; // `${crmUserId}|${kpiKey}` -> count
  let scanned = 0;
  let sample: unknown;
  for (const pid of PIPELINES) {
    const res = await searchOpportunities(pid, { order: "desc", sortBy: "last_stage_changed_at" });
    if (!res.ok) continue;
    const body = res.body as { opportunities?: Array<Record<string, unknown>> };
    for (const o of body.opportunities ?? []) {
      if (!sample) sample = { keys: Object.keys(o), pipelineStageId: o.pipelineStageId, assignedTo: o.assignedTo, lastStageChangeAt: o.lastStageChangeAt, lastStatusChangeAt: o.lastStatusChangeAt, updatedAt: o.updatedAt };
      scanned++;
      const kpi = STAGE_KPI[String(o.pipelineStageId ?? "")];
      if (!kpi) continue;
      const changeRaw = (o.lastStageChangeAt ?? o.lastStatusChangeAt ?? o.updatedAt) as string | number | undefined;
      const ms = typeof changeRaw === "number" ? changeRaw : Date.parse(String(changeRaw ?? 0));
      if (!(ms >= start && ms < end)) continue;
      const uid = String(o.assignedTo ?? "");
      const k = `${uid}|${kpi}`;
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  return { date, counts, scanned, sample };
}

/** Write the opportunity-derived KPI entries (Offers Made, Contracts Sent). */
export async function writeOpps(date: string, tz: string): Promise<OppPull> {
  const pull = await pullOpps(date, tz);
  const users = await db.user.findMany({ select: { id: true, name: true } });
  const userByFirst = new Map(users.map((u) => [u.name.trim().split(/\s+/)[0].toLowerCase(), u.id]));
  const crmToFirst = new Map(AGENTS.map((a) => [a.crm, a.first]));
  for (const [k, value] of Object.entries(pull.counts)) {
    const [crmId, kpiKey] = k.split("|");
    const first = crmToFirst.get(crmId);
    const uid = first ? userByFirst.get(first) : undefined;
    if (uid) await upsertEntry(kpiKey, uid, date, value);
  }
  return pull;
}

async function upsertEntry(kpiKey: string, userId: string, date: string, value: number): Promise<void> {
  const kpi = await db.kpi.findUnique({ where: { key: kpiKey }, select: { id: true } });
  if (!kpi) return;
  const existing = await db.entry.findFirst({ where: { kpiId: kpi.id, userId, date } });
  if (existing) { if (existing.enteredBy === "crm") await db.entry.update({ where: { id: existing.id }, data: { value } }); }
  else if (value > 0) await db.entry.create({ data: { kpiId: kpi.id, userId, date, value, enteredBy: "crm" } });
}

/** Pull a day and write the CRM-derived KPI entries (talk time, conversations, dials). */
export async function writeDay(date: string, tz: string): Promise<{ result: PullResult; wrote: Record<string, Agg> }> {
  const result = await pullDay(date, tz);
  const users = await db.user.findMany({ select: { id: true, name: true } });
  const userByFirst = new Map(users.map((u) => [u.name.trim().split(/\s+/)[0].toLowerCase(), u.id]));
  const wrote: Record<string, Agg> = {};
  for (const a of AGENTS) {
    const uid = userByFirst.get(a.first);
    const agg = result.per[a.crm];
    if (!uid || !agg) continue;
    await upsertEntry(a.talk, uid, date, agg.talkSec);
    if (a.dials) await upsertEntry(a.dials, uid, date, agg.dials);
    if (a.conv) await upsertEntry(a.conv, uid, date, agg.connected);
    wrote[a.first] = agg;
  }
  return { result, wrote };
}
