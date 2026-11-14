import "server-only";
// ⚖️ LITIGATOR PROTOCOL (Jon 2026-11-12/13): when a lead threatens legal action / is fishing for our
// info, snapshot EVERYTHING about them into a permanent record so it can never be lost — when/how
// we got the lead, their consent status, WHETHER + WHEN we opted them out, and every message we sent
// and they sent. This is our legal defense file (TCPA / DNC complaints). Stored in the reserved
// Resource __legal_watch__ (SACRED — never perf-trimmed). The snapshot is re-taken on each new
// flagged message so it stays complete. Threats made on a CALL (no inbound text) are logged manually
// from the /legal-watch page via addManualLegalWatch.
import { db } from "@/lib/db";

export const LEGAL_WATCH_CAT = "__legal_watch__";

export type LegalThreatKind = "litigation-threat" | "info-fishing" | "manual";
export type LegalComm = { at: string; dir: "out" | "in" | "sys"; kind: string; body: string; by: string };
export type LegalWatchRecord = {
  contactId: string; name: string; phone: string; email: string;
  source: string; importedAt: string; pipeline: string; stage: string; assignedTo: string;
  consent: string;            // what we can prove about opt-in
  trigger: string;            // the message / note that tripped the litigator filter
  threatKind: LegalThreatKind;// explicit litigation threat vs info-fishing vs manually logged
  channel: string; flaggedAt: string; firstFlaggedAt: string;
  // 🚫 Opt-out status — proof that we stopped contacting them (Jon 2026-11-13).
  optedOut: boolean; optOutStatus: string; optedOutAt: string | null;
  addedBy?: string;           // set for manually-logged (phone/verbal) threats
  comms: LegalComm[];         // the FULL thread — everything sent + received, timestamped
};

function dirOf(body: string): "out" | "in" | "sys" {
  if (/^➡️?\s*Us/i.test(body) || /^➡/.test(body)) return "out";
  if (/^⬅/.test(body)) return "in";
  return "sys";
}

// Derive opt-out status from the contact's current tags; find WHEN we opted them out from the
// dnc-guard / no-text system events in their timeline.
function deriveOptOut(tags: string, events: { at: Date; body: string; actor: string | null }[]): { optedOut: boolean; optOutStatus: string; optedOutAt: string | null } {
  const t = tags || "";
  const optEvent = events.find((e) => (e.actor === "dnc-guard" || /AUTO-DNC|No-text set|opted out|opt-out/i.test(e.body)));
  const optedOutAt = optEvent ? optEvent.at.toISOString() : null;
  if (/\bdnc\b/i.test(t)) return { optedOut: true, optOutStatus: "🚫 Opted out — DNC (no contact, any channel)", optedOutAt };
  if (/\bdnd_all\b/i.test(t)) return { optedOut: true, optOutStatus: "🚫 Opted out — do-not-disturb (all channels)", optedOutAt };
  if (/\bdnd_sms\b/i.test(t)) return { optedOut: true, optOutStatus: "🔕 Texting suppressed (dnd_sms) — kept for a live deal, worked by a human", optedOutAt };
  if (/\blegal-watch\b/i.test(t)) return { optedOut: false, optOutStatus: "⚠️ NOT opted out — flagged legal-watch (no automation reaches them, but confirm the opt-out)", optedOutAt };
  return { optedOut: false, optOutStatus: "⚠️ NOT opted out — review and opt out if appropriate", optedOutAt };
}

async function readList(): Promise<{ id: string | null; list: LegalWatchRecord[] }> {
  const row = await db.resource.findFirst({ where: { category: LEGAL_WATCH_CAT } }).catch(() => null);
  let list: LegalWatchRecord[] = [];
  try { list = row?.description ? (JSON.parse(row.description) as LegalWatchRecord[]) : []; } catch { list = []; }
  return { id: row?.id ?? null, list };
}

async function writeList(id: string | null, list: LegalWatchRecord[]): Promise<void> {
  const description = JSON.stringify(list.slice(0, 1000));
  if (id) await db.resource.update({ where: { id }, data: { description } });
  else await db.resource.create({ data: { title: "legal-watch", category: LEGAL_WATCH_CAT, url: "", description } });
}

/** Snapshot a flagged lead's complete record (idempotent — updates the same contact's record). */
export async function saveLegalWatchRecord(contactId: string, trigger: string, channel: string, threatKind: LegalThreatKind = "info-fishing"): Promise<void> {
  try {
    const contact = await db.crmContact.findUnique({ where: { id: contactId }, select: { name: true, phone: true, email: true, source: true, createdAt: true, tags: true } });
    if (!contact) return;
    const opp = await db.crmOpportunity.findFirst({ where: { contactId }, orderBy: { createdAt: "asc" }, select: { pipeline: true, stage: true, assignedTo: true } }).catch(() => null);
    const events = await db.crmEvent.findMany({ where: { contactId }, orderBy: { at: "asc" }, take: 800, select: { at: true, kind: true, body: true, actor: true, meta: true } }).catch(() => []);

    // Consent — prove whether they opted in (website form) or it was cold outreach.
    const consentEv = events.find((e) => { const m = e.meta as { type?: string; granted?: boolean } | null; return m?.type === "sms_consent"; });
    const cm = consentEv?.meta as { granted?: boolean } | null;
    const consent = consentEv
      ? (cm?.granted ? `✅ SMS consent GIVEN via website form on ${consentEv.at.toISOString().slice(0, 10)}` : `⚠️ Website lead — SMS consent NOT granted (${consentEv.at.toISOString().slice(0, 10)})`)
      : `Cold outreach — no website opt-in on file (source: ${contact.source || "unknown"})`;

    const comms: LegalComm[] = events
      .filter((e) => ["sms", "email", "call", "note", "system", "stage"].includes(e.kind))
      .map((e) => ({ at: e.at.toISOString(), dir: dirOf(e.body), kind: e.kind, body: e.body.slice(0, 600), by: e.actor || "" }));

    const oo = deriveOptOut(contact.tags || "", events);
    const { id, list } = await readList();
    const prev = list.find((r) => r.contactId === contactId);
    const rec: LegalWatchRecord = {
      contactId, name: contact.name, phone: contact.phone, email: contact.email,
      source: contact.source || "", importedAt: contact.createdAt.toISOString(),
      pipeline: opp?.pipeline || "", stage: opp?.stage || "", assignedTo: opp?.assignedTo || "",
      consent, trigger: (trigger || "").slice(0, 800), threatKind,
      channel, flaggedAt: new Date().toISOString(), firstFlaggedAt: prev?.firstFlaggedAt || new Date().toISOString(),
      optedOut: oo.optedOut, optOutStatus: oo.optOutStatus, optedOutAt: oo.optedOutAt,
      addedBy: prev?.addedBy,
      comms,
    };
    await writeList(id, [rec, ...list.filter((r) => r.contactId !== contactId)]);
  } catch { /* protocol is best-effort but should never break intake */ }
}

/** Manually log a litigation threat made OFF-channel (on a call, in person) — Jon 2026-11-13. If the
 *  person is already a CRM contact, pass contactId to snapshot their full record + optionally opt
 *  them out; otherwise a standalone record is kept from the fields provided. */
export async function addManualLegalWatch(args: { contactId?: string; name: string; phone?: string; email?: string; note: string; by: string; optOut?: boolean }): Promise<void> {
  const note = (args.note || "").slice(0, 800);
  if (args.contactId) {
    if (args.optOut) { try { const { dncContact } = await import("@/lib/crm-dnc"); await dncContact(args.contactId, `manual litigator log by ${args.by}: ${note}`); } catch { /* best-effort */ } }
    try { const { logCrmEvent } = await import("@/lib/crm"); await logCrmEvent({ contactId: args.contactId, oppId: "", kind: "system", body: `⚖️ Litigator logged manually by ${args.by}: ${note}`, actor: "legal-watch" }); } catch { /* best-effort */ }
    // tag legal-watch so automations stop even if we didn't full-DNC
    try { const c = await db.crmContact.findUnique({ where: { id: args.contactId }, select: { tags: true } }); if (c && !/\blegal-watch\b/i.test(c.tags || "")) await db.crmContact.update({ where: { id: args.contactId }, data: { tags: [c.tags, "legal-watch"].filter(Boolean).join(",") } }); } catch { /* best-effort */ }
    await saveLegalWatchRecord(args.contactId, note, "manual (call/verbal)", "manual");
    // stamp who added it
    try { const { id, list } = await readList(); const i = list.findIndex((r) => r.contactId === args.contactId); if (i >= 0) { list[i].addedBy = args.by; await writeList(id, list); } } catch { /* best-effort */ }
    return;
  }
  // Standalone (not in CRM): keep a direct record keyed by a synthetic id.
  const { id, list } = await readList();
  const synthetic = `manual:${(args.phone || args.name || Date.now().toString()).replace(/\s+/g, "").toLowerCase()}`;
  const now = new Date().toISOString();
  const prev = list.find((r) => r.contactId === synthetic);
  const rec: LegalWatchRecord = {
    contactId: synthetic, name: args.name || "Unknown", phone: args.phone || "", email: args.email || "",
    source: "manual log", importedAt: prev?.importedAt || now, pipeline: "", stage: "", assignedTo: "",
    consent: "Logged manually — see note", trigger: note, threatKind: "manual",
    channel: "call/verbal", flaggedAt: now, firstFlaggedAt: prev?.firstFlaggedAt || now,
    optedOut: !!args.optOut, optOutStatus: args.optOut ? "🚫 Opted out — logged manually" : "⚠️ NOT opted out — standalone record (not in CRM)", optedOutAt: args.optOut ? now : null,
    addedBy: args.by,
    comms: [{ at: now, dir: "sys", kind: "note", body: `⚖️ Manually logged by ${args.by}: ${note}`, by: args.by }],
  };
  await writeList(id, [rec, ...list.filter((r) => r.contactId !== synthetic)]);
}

/** One-click "opt them out now" from the /legal-watch page — opts out + re-snapshots the record. */
export async function optOutLegalWatchContact(contactId: string, by: string): Promise<void> {
  if (contactId.startsWith("manual:")) {
    const { id, list } = await readList();
    const i = list.findIndex((r) => r.contactId === contactId);
    if (i >= 0) { list[i].optedOut = true; list[i].optOutStatus = `🚫 Opted out — marked by ${by}`; list[i].optedOutAt = new Date().toISOString(); await writeList(id, list); }
    return;
  }
  try { const { dncContact } = await import("@/lib/crm-dnc"); await dncContact(contactId, `opted out from Litigator Protocol by ${by}`); } catch { /* best-effort */ }
  await saveLegalWatchRecord(contactId, "manual opt-out from Litigator Protocol", "manual", "manual");
}

export async function readLegalWatchRecords(): Promise<LegalWatchRecord[]> {
  const { list } = await readList();
  return list;
}

/** 🔎 One-time backfill: scan recent INBOUND messages for explicit litigation threats and file any
 *  that aren't already on the watch list, so the defense file also covers people who threatened to
 *  sue us BEFORE this system existed (Jon 2026-11-13). Record-only — it does NOT auto-opt-out (a
 *  human reviews each and clicks "Opt them out now"), so it can't surprise a live deal. Capped. */
export async function scanHistoryForThreats(limit = 8000): Promise<{ scanned: number; newlyFlagged: number; names: string[] }> {
  const { HARD_THREAT_REGEX } = await import("@/lib/contact-guard");
  const events = await db.crmEvent.findMany({
    where: { kind: { in: ["sms", "email", "note"] } },
    orderBy: { at: "desc" }, take: limit,
    select: { contactId: true, body: true, at: true, kind: true },
  }).catch(() => []);
  const { list } = await readList();
  const already = new Set(list.map((r) => r.contactId));
  // Most-recent threatening INBOUND message per contact not already on the list.
  const found = new Map<string, { trigger: string; kind: string }>();
  for (const e of events) {
    if (!e.contactId || already.has(e.contactId) || found.has(e.contactId)) continue;
    const body = e.body || "";
    const inbound = /^⬅/.test(body); // their message, not ours
    if (!inbound) continue;
    if (HARD_THREAT_REGEX.test(body)) found.set(e.contactId, { trigger: body.replace(/^⬅️?\s*(Them:|)\s*/i, "").slice(0, 300), kind: e.kind });
  }
  const names: string[] = [];
  let newlyFlagged = 0;
  for (const [contactId, hit] of found) {
    if (newlyFlagged >= 200) break;
    const c = await db.crmContact.findUnique({ where: { id: contactId }, select: { name: true, tags: true } }).catch(() => null);
    if (!c) continue;
    try { if (!/\blegal-watch\b/i.test(c.tags || "")) await db.crmContact.update({ where: { id: contactId }, data: { tags: [c.tags, "legal-watch"].filter(Boolean).join(",") } }); } catch { /* best-effort */ }
    await saveLegalWatchRecord(contactId, hit.trigger, `${hit.kind} (history backfill)`, "litigation-threat");
    names.push(c.name || contactId);
    newlyFlagged++;
  }
  return { scanned: events.length, newlyFlagged, names };
}
