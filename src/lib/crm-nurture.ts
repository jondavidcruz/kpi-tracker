// 🌙 Auto-park never-called NEW leads (accepted AI Update 2026-10-19, built by
// crm-enhancer 2026-10-20). Hundreds of imported leads sit in a pipeline's
// first "new" stage with zero touches, burying the leads that are actually
// being worked. After `days` of silence they slide into that pipeline's
// Nurture stage — nothing is archived or deleted, every move is a timeline
// event, and the last 10 runs are logged in __nurture_park_log__ so
// `?nurturepark=1&undo=1` can put them straight back.
import { db } from "./db";
import { readPipelines } from "./crm";

const LOG_CAT = "__nurture_park_log__";
const ACTOR = "nurture-park";
// a human touch = any of these in the window (notes only when a person wrote them)
const TOUCH_KINDS = ["call", "sms", "email", "voicemail", "stage", "appointment", "task", "file"];
const SYSTEM_ACTOR = /import|ghl|system|warroom|cron|sync|nurture-park|comp-flow|flag-watch|perf-watchdog/i;

export type ParkMove = { id: string; from: string; to: string; pipeline: string; owner: string; title: string };

export async function parkNeverCalled(opts: { commit?: boolean; days?: number } = {}) {
  const days = Math.max(7, Math.min(365, opts.days ?? 30));
  const cutoff = new Date(Date.now() - days * 86400_000);
  const today = new Date().toISOString().slice(0, 10);
  const pipes = await readPipelines();
  // pipeline → { newKeys, nurtureKey } (only pipelines that HAVE a nurture stage)
  const plan = new Map<string, { newKeys: string[]; nurture: string }>();
  for (const p of pipes) {
    const nurture = p.stages.find((s) => /nurture/i.test(s.key) || /nurture/i.test(s.label))?.key;
    const newKeys = p.stages.filter((s) => /^new/i.test(s.key)).map((s) => s.key);
    if (nurture && newKeys.length) plan.set(p.name === "War Room" ? "" : p.name, { newKeys, nurture });
  }
  const pipelineNames = [...plan.keys()];
  if (!pipelineNames.length) return { ok: true, committed: false, days, candidates: 0, moved: 0, perPipeline: {}, perOwner: {}, sample: [], note: "no pipeline has both a new + nurture stage" };
  const raw = await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: pipelineNames }, createdAt: { lt: cutoff }, updatedAt: { lt: cutoff } },
    select: { id: true, contactId: true, title: true, pipeline: true, stage: true, assignedTo: true, nextFollowUp: true },
    take: 20000,
  });
  let cands = raw.filter((o) => plan.get(o.pipeline)?.newKeys.includes(o.stage) && (!o.nextFollowUp || o.nextFollowUp < today));
  if (cands.length) {
    const ids = cands.map((o) => o.id);
    const cids = [...new Set(cands.map((o) => o.contactId))];
    const [openTasks, touches] = await Promise.all([
      db.crmTask.findMany({ where: { doneAt: null, oppId: { in: ids } }, select: { oppId: true } }),
      db.crmEvent.findMany({ where: { at: { gte: cutoff }, OR: [{ oppId: { in: ids } }, { contactId: { in: cids } }] }, select: { oppId: true, contactId: true, kind: true, actor: true } }),
    ]);
    const busyOpp = new Set(openTasks.map((t) => t.oppId));
    const touchedOpp = new Set<string>(); const touchedContact = new Set<string>();
    for (const e of touches) {
      const human = TOUCH_KINDS.includes(e.kind) || (e.kind === "note" && !SYSTEM_ACTOR.test(e.actor || ""));
      if (!human) continue;
      if (e.oppId) touchedOpp.add(e.oppId);
      if (e.contactId) touchedContact.add(e.contactId);
    }
    cands = cands.filter((o) => !busyOpp.has(o.id) && !touchedOpp.has(o.id) && !touchedContact.has(o.contactId));
  }
  const moves: ParkMove[] = cands.map((o) => ({ id: o.id, from: o.stage, to: plan.get(o.pipeline)!.nurture, pipeline: o.pipeline || "War Room", owner: o.assignedTo || "—", title: o.title }));
  const perPipeline: Record<string, number> = {}; const perOwner: Record<string, number> = {};
  for (const m of moves) { perPipeline[m.pipeline] = (perPipeline[m.pipeline] ?? 0) + 1; perOwner[m.owner] = (perOwner[m.owner] ?? 0) + 1; }
  let moved = 0;
  if (opts.commit && moves.length) {
    const byTarget = new Map<string, ParkMove[]>();
    for (const m of moves) { const k = `${m.pipeline}\u0000${m.from}\u0000${m.to}`; byTarget.set(k, [...(byTarget.get(k) ?? []), m]); }
    for (const group of byTarget.values()) {
      const r = await db.crmOpportunity.updateMany({ where: { id: { in: group.map((m) => m.id) }, stage: group[0].from }, data: { stage: group[0].to } });
      moved += r.count;
    }
    const contactOf = new Map(cands.map((o) => [o.id, o.contactId]));
    await db.crmEvent.createMany({ data: moves.map((m) => ({
      contactId: contactOf.get(m.id) ?? "", oppId: m.id, kind: "stage", actor: ACTOR,
      body: `${m.from} → ${m.to} · 🌙 auto-parked: untouched ${days}+ days, never called (undo: /api/cron?nurturepark=1&undo=1)`,
    })) }).catch(() => {});
    await appendLog({ at: new Date().toISOString(), days, moved, moves });
  }
  return { ok: true, committed: !!opts.commit, days, candidates: moves.length, moved, perPipeline, perOwner, sample: moves.slice(0, 12).map((m) => `${m.owner.split(" ")[0]} · ${m.title} · ${m.pipeline} ${m.from} → ${m.to}`) };
}

/** Put the LAST run's leads back where they were (only those still sitting in nurture). */
export async function undoLastPark() {
  const log = await readLog();
  const last = log[0];
  if (!last) return { ok: false, error: "nothing to undo" };
  let restored = 0;
  for (const m of last.moves) {
    const r = await db.crmOpportunity.updateMany({ where: { id: m.id, stage: m.to }, data: { stage: m.from } });
    restored += r.count;
  }
  const ids = last.moves.map((m) => m.id);
  const opps = await db.crmOpportunity.findMany({ where: { id: { in: ids } }, select: { id: true, contactId: true } });
  const cmap = new Map(opps.map((o) => [o.id, o.contactId]));
  await db.crmEvent.createMany({ data: last.moves.map((m) => ({ contactId: cmap.get(m.id) ?? "", oppId: m.id, kind: "stage", actor: ACTOR, body: `${m.to} → ${m.from} · ↩️ auto-park undone` })) }).catch(() => {});
  await writeLog(log.slice(1));
  return { ok: true, restored, of: last.moves.length, runAt: last.at };
}

type LogEntry = { at: string; days: number; moved: number; moves: ParkMove[] };
async function readLog(): Promise<LogEntry[]> {
  const row = await db.resource.findFirst({ where: { category: LOG_CAT } }).catch(() => null);
  try { return row?.description ? (JSON.parse(row.description) as LogEntry[]) : []; } catch { return []; }
}
async function writeLog(list: LogEntry[]) {
  const description = JSON.stringify(list.slice(0, 10));
  const row = await db.resource.findFirst({ where: { category: LOG_CAT } }).catch(() => null);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "nurture-park-log", category: LOG_CAT, url: "", description } });
}
async function appendLog(e: LogEntry) { try { await writeLog([e, ...(await readLog())]); } catch { /* best-effort */ } }
