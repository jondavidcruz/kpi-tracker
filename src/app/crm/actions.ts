"use server";
// Acquisitions CRM actions (Jon 2026-10-07). Access = acquisitions reps +
// managers (same people who could touch these leads in GHL).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { logCrmEvent, CRM_STAGES } from "@/lib/crm";

async function crmUser() {
  const me = await getCurrentUser();
  if (!me) return null;
  if (isManager(me) || me.position === "acquisitions" || me.position === "cc_lm" || me.position === "dispositions") return me;
  return null;
}

/** Quick add: contact + first opportunity in one form. */
export async function createCrmLeadAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || "New opportunity";
  if (!name) return;
  const contact = await db.crmContact.create({ data: {
    name,
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    source: String(formData.get("source") ?? "").trim(),
    assignedTo: String(formData.get("assignedTo") ?? "").trim() || me.name,
  } });
  const opp = await db.crmOpportunity.create({ data: {
    contactId: contact.id, title, stage: "new",
    assignedTo: contact.assignedTo,
  } });
  await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: "Lead created", actor: me.name });
  revalidatePath("/crm");
  redirect(`/crm/${opp.id}`);
}

/** Add another opportunity to an existing contact (multi-opp per contact). */
export async function addOpportunityAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const contactId = String(formData.get("contactId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!contactId || !title) return;
  const opp = await db.crmOpportunity.create({ data: { contactId, title, stage: "new", assignedTo: me.name } });
  await logCrmEvent({ contactId, oppId: opp.id, kind: "system", body: `New opportunity: ${title}`, actor: me.name });
  revalidatePath("/crm");
  redirect(`/crm/${opp.id}`);
}

export async function setOppStageAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!id || !CRM_STAGES.some((s) => s.key === stage)) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id }, select: { contactId: true, stage: true } });
  if (!opp || opp.stage === stage) return;
  await db.crmOpportunity.update({ where: { id }, data: {
    stage,
    ...(stage === "at_developers" ? { devPricingSentAt: new Date() } : {}),
    ...(stage === "dead" ? { archivedAt: new Date() } : { archivedAt: null }),
  } });
  await logCrmEvent({ contactId: opp.contactId, oppId: id, kind: "stage", body: `${opp.stage} → ${stage}`, actor: me.name });
  revalidatePath("/crm");
  revalidatePath(`/crm/${id}`);
}

export async function addCrmNoteAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!contactId || !body) return;
  await logCrmEvent({ contactId, oppId, kind: "note", body, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** Log a call/sms/email the rep just did manually (Telnyx auto-log comes via webhook). */
export async function logCrmTouchAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const kind = String(formData.get("kind") ?? "call");
  const body = String(formData.get("body") ?? "").trim().slice(0, 500);
  if (!contactId || !["call", "sms", "email"].includes(kind)) return;
  await logCrmEvent({ contactId, oppId, kind, body: body || `${kind} — logged by ${me.name}`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

export async function saveOppMetaAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const num = (k: string) => { const s = String(formData.get(k) ?? "").replace(/[$,\s]/g, ""); return s === "" ? null : Number(s) || null; };
  await db.crmOpportunity.update({ where: { id }, data: {
    title: String(formData.get("title") ?? "").trim() || undefined,
    assignedTo: String(formData.get("assignedTo") ?? "").trim(),
    tags: String(formData.get("tags") ?? "").trim().slice(0, 300),
    nextFollowUp: String(formData.get("nextFollowUp") ?? "").trim(),
    value: num("value"), askPrice: num("askPrice"),
  } });
  revalidatePath(`/crm/${id}`);
  revalidatePath("/crm");
}

export async function saveCrmContactAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const oppId = String(formData.get("oppId") ?? "");
  if (!id) return;
  await db.crmContact.update({ where: { id }, data: {
    name: String(formData.get("name") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim(),
    altPhone: String(formData.get("altPhone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    tags: String(formData.get("ctags") ?? "").trim().slice(0, 300),
    pinnedNote: String(formData.get("pinnedNote") ?? "").trim().slice(0, 300),
  } });
  revalidatePath(`/crm/${oppId}`);
}

export async function addCrmTaskAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  if (!title) return;
  await db.crmTask.create({ data: {
    oppId, contactId, title,
    due: String(formData.get("due") ?? "").trim(),
    assignedTo: String(formData.get("assignedTo") ?? "").trim() || me.name,
    createdBy: me.name,
  } });
  revalidatePath(`/crm/${oppId}`);
  revalidatePath("/crm");
}

export async function toggleCrmTaskAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const t = await db.crmTask.findUnique({ where: { id } });
  if (!t) return;
  await db.crmTask.update({ where: { id }, data: t.doneAt ? { doneAt: null, doneBy: "" } : { doneAt: new Date(), doneBy: me.name } });
  if (!t.doneAt && t.contactId) await logCrmEvent({ contactId: t.contactId, oppId: t.oppId, kind: "task", body: `Done: ${t.title}`, actor: me.name });
  revalidatePath(`/crm/${t.oppId}`);
  revalidatePath("/crm");
}

export async function addCrmApptAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const when = String(formData.get("at") ?? ""); // datetime-local
  const at = when ? new Date(when) : null;
  if (!title || !at || Number.isNaN(at.getTime())) return;
  await db.crmAppointment.create({ data: { oppId, contactId, title, at, withWho: String(formData.get("withWho") ?? "").trim() || me.name, note: String(formData.get("note") ?? "").trim().slice(0, 300), createdBy: me.name } });
  if (contactId) await logCrmEvent({ contactId, oppId, kind: "appt", body: `Appointment set: ${title} — ${at.toLocaleString("en-US", { timeZone: "America/New_York" })}`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
  revalidatePath("/crm");
}

export async function deleteCrmApptAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const a = await db.crmAppointment.findUnique({ where: { id } });
  if (!a) return;
  await db.crmAppointment.delete({ where: { id } }).catch(() => {});
  revalidatePath(`/crm/${a.oppId}`);
}

/** Browser-dialer call ended → one timeline row with the duration. */
export async function logBrowserCallAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const contactId = String(formData.get("contactId") ?? "");
  const oppId = String(formData.get("oppId") ?? "");
  const secs = Number(formData.get("secs")) || 0;
  const to = String(formData.get("to") ?? "");
  if (!contactId) return;
  await logCrmEvent({
    contactId, oppId, kind: "call",
    body: `Browser call → ${to}${secs ? ` · ${Math.floor(secs / 60)}m ${secs % 60}s` : " · no answer"}`,
    meta: { secs, via: "telnyx-webrtc" }, actor: me.name,
  });
  revalidatePath(`/crm/${oppId}`);
}

/** Attach a party to the deal — listing agent, escrow, title, attorney… */
export async function addCrmPartyAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!oppId || !name) return;
  await db.crmParty.create({ data: {
    oppId, name,
    role: String(formData.get("role") ?? "").trim().slice(0, 40),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    note: String(formData.get("note") ?? "").trim().slice(0, 200),
    createdBy: me.name,
  } });
  revalidatePath(`/crm/${oppId}`);
}

export async function deleteCrmPartyAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const p = await db.crmParty.findUnique({ where: { id } });
  if (!p) return;
  await db.crmParty.delete({ where: { id } }).catch(() => {});
  revalidatePath(`/crm/${p.oppId}`);
}

/** Telnyx click-to-call: rings the rep's phone first, then bridges the lead.
 *  Needs TELNYX_CONNECTION_ID (Call Control app) + the rep's phone on file —
 *  until then the UI offers tel: dialing and manual logging. */
export async function telnyxCallAction(formData: FormData): Promise<{ ok: boolean; msg: string }> {
  const me = await crmUser();
  if (!me) return { ok: false, msg: "no access" };
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const to = String(formData.get("to") ?? "").replace(/[^+\d]/g, "");
  const key = process.env.TELNYX_API_KEY;
  const conn = process.env.TELNYX_CONNECTION_ID;
  const from = process.env.TELNYX_CALLER_ID;
  const repPhone = String(formData.get("repPhone") ?? "").replace(/[^+\d]/g, "");
  if (!key || !conn || !from) return { ok: false, msg: "Telnyx dialer not armed yet — set TELNYX_CONNECTION_ID + TELNYX_CALLER_ID in Vercel (setup guide on the card). Use 📱 tel: for now." };
  if (!to || !repPhone) return { ok: false, msg: "Need both the lead's number and your phone number (set it on /account)." };
  try {
    const res = await fetch("https://api.telnyx.com/v2/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ connection_id: conn, to: repPhone, from, client_state: Buffer.from(JSON.stringify({ bridgeTo: to, oppId, contactId, rep: me.name })).toString("base64"), webhook_url: "https://kpi-tracker-lovat.vercel.app/api/telnyx/call" }),
    });
    if (!res.ok) return { ok: false, msg: `Telnyx: ${res.status} ${(await res.text()).slice(0, 120)}` };
    if (contactId) await logCrmEvent({ contactId, oppId, kind: "call", body: `Click-to-call started → ${to}`, actor: me.name });
    return { ok: true, msg: "📞 Your phone is ringing — answer and we bridge the seller in." };
  } catch (e) { return { ok: false, msg: String(e).slice(0, 140) }; }
}
