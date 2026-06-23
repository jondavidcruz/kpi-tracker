import { db } from "./db";
import { searchConversations, getMessages } from "./reireply";

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
