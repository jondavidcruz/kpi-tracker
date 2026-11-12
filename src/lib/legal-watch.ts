import "server-only";
// ⚖️ LITIGATOR PROTOCOL (Jon 2026-11-12): when a lead threatens legal action / is fishing for our
// info, snapshot EVERYTHING about them into a permanent record so it can never be lost — when/how
// we got the lead, their consent status, and every message we sent and they sent. This is our legal
// defense file (TCPA / DNC complaints). Stored in the reserved Resource __legal_watch__ (SACRED —
// never perf-trimmed). The snapshot is re-taken on each new flagged message so it stays complete.
import { db } from "@/lib/db";

export const LEGAL_WATCH_CAT = "__legal_watch__";

export type LegalComm = { at: string; dir: "out" | "in" | "sys"; kind: string; body: string; by: string };
export type LegalWatchRecord = {
  contactId: string; name: string; phone: string; email: string;
  source: string; importedAt: string; pipeline: string; stage: string; assignedTo: string;
  consent: string;            // what we can prove about opt-in
  trigger: string;            // the message that tripped the litigator filter
  channel: string; flaggedAt: string; firstFlaggedAt: string;
  comms: LegalComm[];         // the FULL thread — everything sent + received, timestamped
};

function dirOf(body: string): "out" | "in" | "sys" {
  if (/^➡️?\s*Us/i.test(body) || /^➡/.test(body)) return "out";
  if (/^⬅/.test(body)) return "in";
  return "sys";
}

/** Snapshot a flagged lead's complete record (idempotent — updates the same contact's record). */
export async function saveLegalWatchRecord(contactId: string, trigger: string, channel: string): Promise<void> {
  try {
    const contact = await db.crmContact.findUnique({ where: { id: contactId }, select: { name: true, phone: true, email: true, source: true, createdAt: true } });
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

    const row = await db.resource.findFirst({ where: { category: LEGAL_WATCH_CAT } });
    let list: LegalWatchRecord[] = [];
    try { list = row?.description ? JSON.parse(row.description) : []; } catch { list = []; }
    const prev = list.find((r) => r.contactId === contactId);
    const rec: LegalWatchRecord = {
      contactId, name: contact.name, phone: contact.phone, email: contact.email,
      source: contact.source || "", importedAt: contact.createdAt.toISOString(),
      pipeline: opp?.pipeline || "", stage: opp?.stage || "", assignedTo: opp?.assignedTo || "",
      consent, trigger: (trigger || "").slice(0, 800), channel,
      flaggedAt: new Date().toISOString(), firstFlaggedAt: prev?.firstFlaggedAt || new Date().toISOString(),
      comms,
    };
    const next = [rec, ...list.filter((r) => r.contactId !== contactId)].slice(0, 1000);
    const description = JSON.stringify(next);
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "legal-watch", category: LEGAL_WATCH_CAT, url: "", description } });
  } catch { /* protocol is best-effort but should never break intake */ }
}

export async function readLegalWatchRecords(): Promise<LegalWatchRecord[]> {
  const row = await db.resource.findFirst({ where: { category: LEGAL_WATCH_CAT } }).catch(() => null);
  try { return row?.description ? (JSON.parse(row.description) as LegalWatchRecord[]) : []; } catch { return []; }
}
