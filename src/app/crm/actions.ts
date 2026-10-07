"use server";
// Acquisitions CRM actions (Jon 2026-10-07). Access = acquisitions reps +
// managers (same people who could touch these leads in GHL).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { logCrmEvent, CRM_STAGES, readPipelines } from "@/lib/crm";

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
  const valid = (await readPipelines()).some((p) => p.stages.some((st) => st.key === stage));
  if (!id || !valid) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id }, select: { contactId: true, stage: true } });
  if (!opp || opp.stage === stage) return;
  await db.crmOpportunity.update({ where: { id }, data: {
    stage,
    ...(stage === "at_developers" ? { devPricingSentAt: new Date() } : {}),
    ...(stage === "dead" ? { archivedAt: new Date() } : { archivedAt: null }),
  } });
  await logCrmEvent({ contactId: opp.contactId, oppId: id, kind: "stage", body: `${opp.stage} → ${stage}`, actor: me.name });
  // ⚙️ fire matching automations (never blocks the move)
  const full = await db.crmOpportunity.findUnique({ where: { id }, select: { id: true, contactId: true, pipeline: true, stage: true, assignedTo: true, title: true, value: true, askPrice: true } });
  if (full) { const { runStageAutomations } = await import("@/lib/crm-automations"); runStageAutomations(full).catch(() => {}); }
  // 📝 GHL-parity (Jon 2026-10-07): hitting an offer/contract stage auto-drafts
  // the PandaDoc contract so the rep just reviews and sends. Never blocks.
  if (full && /offer|contract/i.test(stage) && !/rejected|sent/i.test(stage)) {
    // cash unless the lead is tagged novation (buttons on the card override)
    const kind = /novation/i.test((await db.crmOpportunity.findUnique({ where: { id }, select: { tags: true } }))?.tags ?? "") ? "novation" : "cash";
    draftContract(full.id, kind, me.name).catch(() => {});
  }
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
  const plRaw = formData.get("pipeline");
  await db.crmOpportunity.update({ where: { id }, data: {
    ...(plRaw != null ? { pipeline: String(plRaw) === "War Room" ? "" : String(plRaw) } : {}),
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
    altEmail: String(formData.get("altEmail") ?? "").trim(),
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
  revalidatePath("/crm/tasks");
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
  revalidatePath("/crm/tasks");
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
  revalidatePath("/crm/calendar");
}

export async function deleteCrmApptAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const a = await db.crmAppointment.findUnique({ where: { id } });
  if (!a) return;
  await db.crmAppointment.delete({ where: { id } }).catch(() => {});
  revalidatePath(`/crm/${a.oppId}`);
  revalidatePath("/crm/calendar");
}

/** Owner/managers: set who gets the paid channels (call / SMS / email). */
export async function saveCommsPermsAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const { readCommsMap, writeCommsMap } = await import("@/lib/crm-comms");
  const map = await readCommsMap();
  const first = String(formData.get("first") ?? "").toLowerCase().trim();
  if (!first) return;
  map[first] = { call: formData.get("call") === "on", sms: formData.get("sms") === "on", email: formData.get("email") === "on" };
  await writeCommsMap(map);
  revalidatePath("/crm");
}

/** Anyone: save their own email signature (used on every CRM email they send). */
export async function saveSignatureAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const { readSignatures, writeSignatures, firstOf } = await import("@/lib/crm-comms");
  const map = await readSignatures();
  map[firstOf(me.name)] = String(formData.get("signature") ?? "").trim().slice(0, 600);
  await writeSignatures(map);
  revalidatePath("/account");
}

/** ✉️ Send a real email to the seller from the card (Resend, reply-to us). */
export async function sendCrmEmailAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const { commsFor } = await import("@/lib/crm-comms");
  if (!(await commsFor(me)).email) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const to = String(formData.get("to") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 150);
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!to || !subject || !body) return;
  // GHL-style agent identity: From = the rep (on our domain), reply-to their
  // real inbox, their own signature appended.
  const { readSignatures, firstOf, defaultSignature } = await import("@/lib/crm-comms");
  const sig = (await readSignatures())[firstOf(me.name)] || defaultSignature(me.name);
  const domain = (process.env.ALERT_EMAIL_FROM ?? "info@freedom-offers.com").split("@")[1] ?? "freedom-offers.com";
  const fromAddr = `${me.name} <${firstOf(me.name)}@${domain}>`;
  const html = `<p>${body.replace(/\n/g, "<br>")}</p><p style="color:#64748b;font-size:13px;white-space:pre-line">${sig.replace(/</g, "&lt;")}</p>`;
  const { getChannelConfig, sendEmailTo } = await import("@/lib/notify");
  const cfg = { ...(await getChannelConfig()), emailFrom: fromAddr };
  const ok = await sendEmailTo([to], subject, html, cfg, me.email || process.env.CASCADE_REPLY_TO || "info@freedom-offers.com");
  await logCrmEvent({ contactId, oppId, kind: "email", body: `➡️ Us: ${subject} — ${body.slice(0, 300)}${ok ? "" : " (SEND FAILED)"}`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** 💬 Send a real SMS via Telnyx from the card. */
export async function sendCrmSmsAction(formData: FormData): Promise<void> {
  const me = await crmUser();
  if (!me) return;
  const { commsFor } = await import("@/lib/crm-comms");
  if (!(await commsFor(me)).sms) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const to = String(formData.get("to") ?? "").replace(/[^+\d]/g, "");
  const text = String(formData.get("text") ?? "").trim().slice(0, 900);
  let from = process.env.TELNYX_SMS_FROM || process.env.TELNYX_CALLER_ID;
  // rep picked a From number — honor it only if it's one of OUR lines
  const reqFrom = String(formData.get("from") ?? "").replace(/[^+\d]/g, "");
  if (reqFrom && reqFrom !== from && process.env.TELNYX_API_KEY) {
    try {
      const cfgRow = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
      const cfg = (cfgRow?.description ? JSON.parse(cfgRow.description) : {}) as { connId?: string; ccAppId?: string };
      const ours = new Set([cfg.connId, cfg.ccAppId].filter(Boolean));
      const res = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=250", { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, cache: "no-store" });
      const body = (await res.json()) as { data?: Array<{ phone_number?: string; connection_id?: string }> };
      if ((body.data ?? []).some((n) => n.phone_number === reqFrom && ours.has(String(n.connection_id ?? "")))) from = reqFrom;
    } catch { /* fall back to the default line */ }
  }
  if (!to || !text) return;
  if (!process.env.TELNYX_API_KEY || !from) {
    await logCrmEvent({ contactId, oppId, kind: "sms", body: `SMS NOT SENT — set TELNYX_SMS_FROM (a Telnyx number on a messaging profile) in Vercel. Message was: ${text.slice(0, 200)}`, actor: me.name });
    revalidatePath(`/crm/${oppId}`);
    return;
  }
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, text }),
  });
  const ok = res.ok;
  const err = ok ? "" : (await res.text()).slice(0, 140);
  await logCrmEvent({ contactId, oppId, kind: "sms", body: `➡️ Us: ${text}${ok ? "" : ` (SEND FAILED: ${err})`}`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** List-view bulk actions: reassign / add tag / move stage for many at once. */
export async function bulkOppAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const ids = formData.getAll("ids").map(String).filter(Boolean).slice(0, 200);
  const op = String(formData.get("op") ?? "");
  const val = String(formData.get("val") ?? "").trim();
  if (!ids.length || !val) return;
  if (op === "assign") await db.crmOpportunity.updateMany({ where: { id: { in: ids } }, data: { assignedTo: val } });
  else if (op === "stage" && CRM_STAGES.some((s) => s.key === val)) {
    await db.crmOpportunity.updateMany({ where: { id: { in: ids } }, data: { stage: val, ...(val === "dead" ? { archivedAt: new Date() } : {}) } });
  } else if (op === "tag") {
    for (const id of ids) {
      const o = await db.crmOpportunity.findUnique({ where: { id }, select: { tags: true } });
      if (o && !o.tags.toLowerCase().includes(val.toLowerCase())) await db.crmOpportunity.update({ where: { id }, data: { tags: o.tags ? `${o.tags}, ${val}` : val } });
    }
  } else return;
  revalidatePath("/crm");
}

/** Enroll a lead in an email sequence (needs email perm; stops on reply). */
export async function enrollSequenceAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const { commsFor } = await import("@/lib/crm-comms");
  if (!(await commsFor(me)).email) return;
  const { readSequences, readSeqState, writeSeqState, ymdPlus } = await import("@/lib/crm-templates");
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const seqId = String(formData.get("seqId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!oppId || !contactId || !email) return;
  const seq = (await readSequences()).find((x) => x.id === seqId);
  if (!seq) return;
  const state = await readSeqState();
  state[oppId] = { seqId, step: 0, nextYmd: ymdPlus(seq.steps[0]?.day ?? 0), email, enrolledBy: me.name, startedYmd: new Date().toISOString().slice(0, 10) };
  await writeSeqState(state);
  await logCrmEvent({ contactId, oppId, kind: "system", body: `Enrolled in email sequence "${seq.name}" (${seq.steps.length} steps) — auto-stops the moment they reply`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

export async function unenrollSequenceAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const { readSeqState, writeSeqState } = await import("@/lib/crm-templates");
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const state = await readSeqState();
  if (state[oppId]) {
    delete state[oppId];
    await writeSeqState(state);
    if (contactId) await logCrmEvent({ contactId, oppId, kind: "system", body: "Removed from email sequence", actor: me.name });
  }
  revalidatePath(`/crm/${oppId}`);
}

/** Power dialer: log the outcome of the current queue call and advance. */
export async function dialerOutcomeAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const next = Number(formData.get("next")) || 0;
  if (!oppId || !contactId) return;
  const NEXT_DAYS: Record<string, number> = { no_answer: 1, voicemail: 2, callback: 0, talked: 3, not_interested: 30 };
  const label: Record<string, string> = { no_answer: "no answer", voicemail: "left voicemail", callback: "callback requested", talked: "talked — good convo", not_interested: "not interested (nurture)" };
  if (outcome in NEXT_DAYS) {
    const nf = new Date(Date.now() + NEXT_DAYS[outcome] * 86400000).toISOString().slice(0, 10);
    await db.crmOpportunity.update({ where: { id: oppId }, data: { nextFollowUp: nf, ...(outcome === "not_interested" ? { stage: "nurture" } : {}) } });
    await logCrmEvent({ contactId, oppId, kind: "call", body: `Dialer: ${label[outcome]}${note ? ` — ${note}` : ""} · next follow-up ${nf}`, actor: me.name });
  }
  revalidatePath("/crm");
  redirect(`/crm/dialer?i=${next}`);
}

/** Managers: create / toggle / delete automation rules. */
export async function saveAutomationAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const { readRules, writeRules } = await import("@/lib/crm-automations");
  type Rule = import("@/lib/crm-automations").CrmRule;
  const rules = await readRules();
  const op = String(formData.get("op") ?? "add");
  if (op === "toggle" || op === "delete") {
    const id = String(formData.get("id") ?? "");
    const i = rules.findIndex((r) => r.id === id);
    if (i >= 0) { if (op === "delete") rules.splice(i, 1); else rules[i].enabled = !rules[i].enabled; await writeRules(rules); }
    revalidatePath("/crm");
    return;
  }
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const trigger = String(formData.get("trigger") ?? ""); // "pipeline::stageKey" or "::stageKey"
  const [pipeline, stage] = trigger.split("::");
  const action = String(formData.get("action") ?? "task") as Rule["action"];
  if (!name || !stage || !["task", "tag", "followup", "enroll"].includes(action)) return;
  rules.push({
    id: Math.random().toString(36).slice(2, 10), name, pipeline: pipeline ?? "", stage, action,
    params: {
      title: String(formData.get("p_title") ?? "").trim().slice(0, 120) || undefined,
      dueDays: Number(formData.get("p_dueDays")) || 0,
      tag: String(formData.get("p_tag") ?? "").trim().slice(0, 40) || undefined,
      days: Number(formData.get("p_days")) || 1,
      seqId: String(formData.get("p_seqId") ?? "") || undefined,
    },
    enabled: true, createdBy: me!.name,
  });
  await writeRules(rules);
  revalidatePath("/crm");
}

/** Managers: create or edit a pipeline — name + its stages, free-typed. */
export async function savePipelineAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const { readGhlPipelinesRaw, writeGhlPipelines, stageSlug } = await import("@/lib/crm");
  const list = await readGhlPipelinesRaw();
  const original = String(formData.get("original") ?? ""); // "" = create new
  const del = formData.get("del") === "1";
  const i = list.findIndex((p) => p.name === original);
  if (del) {
    if (i >= 0) {
      const count = await db.crmOpportunity.count({ where: { pipeline: original, archivedAt: null } });
      if (count > 0) return; // never orphan live leads
      list.splice(i, 1);
      await writeGhlPipelines(list);
    }
    revalidatePath("/crm");
    return;
  }
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const stageLines = String(formData.get("stages") ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 25);
  if (!name || !stageLines.length) return;
  const stages = stageLines.map((label) => ({ key: stageSlug(label), label }));
  const entry = { name, stages };
  if (i >= 0) {
    list[i] = entry;
    if (original !== name) await db.crmOpportunity.updateMany({ where: { pipeline: original }, data: { pipeline: name } });
  } else list.push(entry);
  await writeGhlPipelines(list);
  revalidatePath("/crm");
}

/** Owner/managers: drag-ordered KPIs → sortOrder (10,20,30…). */
export async function saveKpiOrderAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  let ids: string[] = [];
  try { ids = JSON.parse(String(formData.get("order") ?? "[]")); } catch { return; }
  if (!Array.isArray(ids) || ids.length > 60) return;
  for (let i = 0; i < ids.length; i++) {
    await db.kpi.update({ where: { id: String(ids[i]) }, data: { sortOrder: (i + 1) * 10 } }).catch(() => {});
  }
  revalidatePath("/entry");
  revalidatePath("/report");
  revalidatePath("/admin");
}

/** Save one discovery form's answers onto the opportunity. */
export async function saveCrmFormAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const formKey = String(formData.get("formKey") ?? "");
  const { CRM_FORMS } = await import("@/lib/crm-forms");
  const form = CRM_FORMS.find((f) => f.key === formKey);
  if (!oppId || !form) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true } });
  if (!opp) return;
  const answers: Record<string, string | string[]> = {};
  for (const f of form.fields) {
    if (f.type === "checks") {
      const vals = formData.getAll(`f_${f.key}`).map(String).filter(Boolean);
      if (vals.length) answers[f.key] = vals;
    } else {
      const v = String(formData.get(`f_${f.key}`) ?? "").trim().slice(0, 1000);
      if (v) answers[f.key] = v;
    }
  }
  const existing = (opp.formData ?? {}) as Record<string, unknown>;
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...existing, [formKey]: answers } as never } });
  if (contactId) await logCrmEvent({ contactId, oppId, kind: "system", body: `${form.emoji} ${form.name} updated (${Object.keys(answers).length} answers)`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** Card popover: slap a tag on an opportunity instantly. */
export async function addOppTagAction(formData: FormData): Promise<void> {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const tag = String(formData.get("tag") ?? "").trim().slice(0, 40);
  if (!id || !tag) return;
  const o = await db.crmOpportunity.findUnique({ where: { id }, select: { tags: true } });
  if (!o) return;
  if (!o.tags.toLowerCase().split(",").map((t) => t.trim()).includes(tag.toLowerCase())) {
    await db.crmOpportunity.update({ where: { id }, data: { tags: o.tags ? `${o.tags}, ${tag}` : tag } });
  }
  revalidatePath("/crm");
}

/** Softphone outcome quick-log (no redirect — stays in the panel). */
export async function dialerOutcomeQuickAction(formData: FormData): Promise<void> {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const NEXT_DAYS: Record<string, number> = { no_answer: 1, voicemail: 2, callback: 0, talked: 3, not_interested: 30 };
  const label: Record<string, string> = { no_answer: "no answer", voicemail: "left voicemail", callback: "callback requested", talked: "talked — good convo", not_interested: "not interested (nurture)" };
  if (!oppId || !contactId || !(outcome in NEXT_DAYS)) return;
  const nf = new Date(Date.now() + NEXT_DAYS[outcome] * 86400000).toISOString().slice(0, 10);
  await db.crmOpportunity.update({ where: { id: oppId }, data: { nextFollowUp: nf, ...(outcome === "not_interested" ? { stage: "nurture" } : {}) } });
  await logCrmEvent({ contactId, oppId, kind: "call", body: `Dialer: ${label[outcome]} · next follow-up ${nf}`, actor: me.name });
  revalidatePath("/crm");
}

/** Managers: save the snippet library (one per line pipe format). */
export async function saveSnippetsAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const { writeSnippets } = await import("@/lib/crm-templates");
  type Snip = import("@/lib/crm-templates").Snippet;
  const raw = String(formData.get("raw") ?? "");
  const list: Snip[] = [];
  for (const line of raw.split("\n")) {
    const [kind, name, subject, ...rest] = line.split("|");
    const body = rest.join("|").trim();
    if (!["sms", "email"].includes((kind ?? "").trim()) || !name?.trim() || !body) continue;
    list.push({ id: `${kind.trim()}-${list.length}`, kind: kind.trim() as Snip["kind"], name: name.trim().slice(0, 60), subject: subject?.trim() || undefined, body: body.replaceAll("\\n", "\n").slice(0, 2000) });
  }
  if (list.length) await writeSnippets(list);
  revalidatePath("/crm");
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
  const { commsFor } = await import("@/lib/crm-comms");
  if (!(await commsFor(me)).call) return { ok: false, msg: "Calling isn't enabled for you — ask Jon." };
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

/** Shared PandaDoc drafter: cash vs novation template, timeline log + task. */
async function draftContract(oppId: string, kind: string, actor: string): Promise<{ ok: boolean; msg: string }> {
  const { pandadocConfigured, createOfferDraft, PANDADOC_TEMPLATES } = await import("@/lib/pandadoc");
  if (!pandadocConfigured()) return { ok: false, msg: "PandaDoc key missing" };
  const tpl = PANDADOC_TEMPLATES[kind] ?? PANDADOC_TEMPLATES.cash;
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, include: { contact: true } });
  if (!opp) return { ok: false, msg: "lead not found" };
  const c = opp.contact;
  const price = opp.value ?? opp.askPrice;
  const r = await createOfferDraft({
    name: `${kind === "novation" ? "Novation" : "Cash"} offer — ${c.name}${c.address ? ` — ${c.address}` : ""}`,
    recipientEmail: c.email, recipientName: c.name, templateId: tpl.id,
    tokens: {
      "Seller.Name": c.name, "Property.Address": c.address,
      "Offer.Price": price != null ? `$${price.toLocaleString()}` : "", "Rep.Name": opp.assignedTo || actor,
    },
    metadata: { oppId: opp.id, contactId: c.id, kind },
  });
  if (r.id) {
    await logCrmEvent({ contactId: c.id, oppId: opp.id, kind: "system", body: `📝 ${kind === "novation" ? "NOVATION" : "CASH"} contract DRAFTED (${tpl.label}) — review & send: https://app.pandadoc.com/a/#/documents/${r.id}`, actor: "pandadoc" });
    await db.crmTask.create({ data: { oppId: opp.id, contactId: c.id, title: `📝 Review & send the drafted ${kind} contract (PandaDoc)`, due: new Date().toISOString().slice(0, 10), assignedTo: opp.assignedTo || actor, createdBy: "pandadoc" } }).catch(() => {});
    revalidatePath(`/crm/${opp.id}`);
    return { ok: true, msg: "drafted" };
  }
  await logCrmEvent({ contactId: c.id, oppId: opp.id, kind: "system", body: `PandaDoc ${kind} draft failed: ${r.error}`, actor: "pandadoc" });
  revalidatePath(`/crm/${opp.id}`);
  return { ok: false, msg: r.error ?? "failed" };
}

/** Card buttons: 📝 Draft cash / novation contract on demand. */
export async function draftContractAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const kind = String(formData.get("kind") ?? "cash") === "novation" ? "novation" : "cash";
  if (!oppId) return;
  await draftContract(oppId, kind, me.name);
}
