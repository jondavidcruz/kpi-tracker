"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { fromInput, type Unit } from "@/lib/format";
import { dispatchHardAlerts, evaluateAndRecordAlerts } from "@/lib/alerts";
import { buildPipDraft } from "@/lib/pip";
import { getChannelConfig, sendEmail, sendEmailTo, alertEmailHtml, sendGoogleChat } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManager, isAdmin, canCurateSoftware, canAccessMarketing } from "@/lib/auth";
import { isExcusedReason } from "@/lib/alert-resolution";
import { scoreTranscript } from "@/lib/score";
import { callTypeLabel } from "@/lib/call-types";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { quarterOf, quarterEnd } from "@/lib/eos";
import { encryptSecret, vaultConfigured } from "@/lib/crypto";
import { adminConfigured, createAdminClient, findAuthUserByEmail } from "@/lib/supabase/admin";

// --- Email + password auth management ---------------------------------------

/** Owner sets/creates a team member's password (no email needed). Admin only. */
export async function setTeamPassword(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  if (!adminConfigured()) redirect("/admin?pwerr=nokey#access");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) redirect("/admin?pwerr=short#access");
  const admin = createAdminClient();
  const authId = await findAuthUserByEmail(email);
  const res = authId
    ? await admin.auth.admin.updateUserById(authId, { password, email_confirm: true })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (res.error) redirect("/admin?pwerr=1#access");
  revalidatePath("/admin");
  redirect(`/admin?pwok=${encodeURIComponent(email)}#access`);
}

/** Any signed-in user sets their own password (uses their session). */
export async function setMyPassword(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const password = String(formData.get("password") ?? "");
  const to = String(formData.get("to") ?? "/account") === "/admin" ? "/admin" : "/account";
  const anchor = to === "/admin" ? "#access" : "";
  if (password.length < 8) redirect(`${to}?pwerr=short${anchor}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`${to}?pwerr=1${anchor}`);
  redirect(`${to}?pwok=you${anchor}`);
}

/** Sign the current user out and return to the login screen. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Save a day's entries. Form fields are named `v|<kpiId>|<userId>` where an
 * empty userId means a team-scope KPI. Duration inputs arrive in minutes.
 */
export async function saveDay(formData: FormData) {
  const date = String(formData.get("date") ?? "");
  const enteredBy = String(formData.get("enteredBy") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Invalid date");
  }

  const kpis = await db.kpi.findMany({ where: { active: true } });
  const unitById = new Map(kpis.map((k) => [k.id, k.unit as Unit]));

  const touchedKpiIds = new Set<string>();

  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith("v|")) continue;
    const [, kpiId, userIdRaw] = name.split("|");
    const unit = unitById.get(kpiId);
    if (!unit) continue;
    const userId = userIdRaw ? userIdRaw : null;
    const value = fromInput(unit, String(raw));

    const existing = await db.entry.findFirst({ where: { kpiId, userId, date } });
    if (value === null) {
      // Blank clears an existing entry.
      if (existing) await db.entry.delete({ where: { id: existing.id } });
      continue;
    }
    if (existing) {
      await db.entry.update({
        where: { id: existing.id },
        data: { value, enteredBy, enteredAt: new Date() },
      });
    } else {
      await db.entry.create({
        data: { kpiId, userId, date, value, enteredBy },
      });
    }
    touchedKpiIds.add(kpiId);
  }

  // Instant alerting on save:
  //  • In-app flags update immediately (dashboard + alerts inbox).
  //  • HARD (green money) misses fire to Google Chat + email RIGHT AWAY, each
  //    with a gap assessment + training plan, so a manager is notified the
  //    moment someone is off a money KPI.
  //  • SOFT (activity) misses are batched into the twice-daily digest
  //    (8:30am pre-shift + 6:30pm post-shift via /api/cron).
  const created = await evaluateAndRecordAlerts(date, [...touchedKpiIds]);
  await dispatchHardAlerts(created);

  revalidatePath("/dashboard");
  revalidatePath("/entry");
  revalidatePath("/alerts");
  revalidatePath("/monthly");
}

function revalidateAlerts() {
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  revalidatePath("/entry");
}

/** Lightweight status flips: acknowledge, reopen. (Resolve has its own action.) */
export async function setAlertStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["open", "ack", "resolved"].includes(status)) return;
  // Reopening clears any prior resolution so it's a clean slate again.
  const data =
    status === "open"
      ? { status, resolvedBy: null, resolvedAt: null, resolutionCategory: null, excused: false }
      : { status };
  await db.alert.update({ where: { id }, data });
  revalidateAlerts();
}

/**
 * Resolve an alert WITH accountability: a reason category, what happened, and a
 * corrective action (pre-filled from the gap coaching). Records who/when. An
 * "excused" reason marks it as a legitimate non-miss (kept out of PIP + trends).
 */
export async function resolveAlert(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const resolutionCategory = String(formData.get("resolutionCategory") ?? "").trim() || null;
  const resolutionNote = String(formData.get("resolutionNote") ?? "").trim() || null;
  const correctiveAction = String(formData.get("correctiveAction") ?? "").trim() || null;
  const excused = isExcusedReason(resolutionCategory);
  const me = await getCurrentUser();
  await db.alert.update({
    where: { id },
    data: {
      status: "resolved",
      resolutionCategory,
      resolutionNote,
      correctiveAction,
      excused,
      resolvedBy: me?.name ?? "manager",
      resolvedAt: new Date(),
    },
  });
  revalidateAlerts();
}

/**
 * Bulk-resolve open/ack alerts: either a list of ids, every alert on a given
 * date, or everything older than today. A quick way to keep the inbox useful.
 */
export async function bulkResolveAlerts(formData: FormData) {
  const mode = String(formData.get("mode") ?? "ids");
  const me = await getCurrentUser();
  const base = { status: "resolved" as const, resolvedBy: me?.name ?? "manager", resolvedAt: new Date(), resolutionCategory: "process" };

  if (mode === "ids") {
    const ids = String(formData.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length) await db.alert.updateMany({ where: { id: { in: ids } }, data: base });
  } else if (mode === "date") {
    const date = String(formData.get("date") ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await db.alert.updateMany({ where: { date, status: { in: ["open", "ack"] } }, data: base });
    }
  } else if (mode === "older") {
    const before = String(formData.get("before") ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(before)) {
      await db.alert.updateMany({ where: { date: { lt: before }, status: { in: ["open", "ack"] } }, data: base });
    }
  }
  revalidateAlerts();
}

/** A rep adds their own context to one of their open alerts (doesn't resolve it). */
export async function addRepReason(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const repReason = String(formData.get("repReason") ?? "").trim();
  if (!id || !repReason) return;
  await db.alert.update({ where: { id }, data: { repReason } });
  revalidateAlerts();
}

// --- Support tickets ---------------------------------------------------------
// A ticket is inert data: filing one stores text and notifies admins. It NEVER
// triggers a system change. Only an admin moving it past "new" (setTicketStatus,
// which is role-gated below) puts it into the work queue. The team cannot alter
// the app by filing tickets.

/** Anyone signed in can file a ticket about something broken in the tracker. */
export async function submitTicket(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return; // must be signed in
  const rawTitle = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const severity = String(formData.get("severity") ?? "normal").trim();
  // Forgiving: if they typed everything into Details and left the summary blank,
  // use the first line of the details as the title. Only bail if BOTH are empty.
  const title = rawTitle || body.split("\n")[0].slice(0, 80);
  if (!title) {
    redirect("/tickets?empty=1");
  }

  await db.ticket.create({
    data: { submittedBy: me.name, userId: me.id, title, body, area, severity, status: "new" },
  });

  // Ping the admins so the queue gets watched. Best-effort; never blocks the save.
  try {
    const cfg = await getChannelConfig();
    const settings = await db.settings.findUnique({ where: { id: 1 } });
    const list = (settings?.weeklyEmailRecipients || cfg.emailRecipients.join(","))
      .split(/[,;\s]+/).map((x: string) => x.trim()).filter(Boolean);
    const sevTag = severity === "blocking" ? "🔴 BLOCKING " : "";
    await sendEmail(
      `🎫 ${sevTag}New tracker ticket from ${me.name}: ${title}`,
      `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;color:#0f172a;">
        <p><strong>${escapeForEmail(me.name)}</strong> reported an issue with the KPI tracker.</p>
        <p><strong>Area:</strong> ${escapeForEmail(area || "—")} &nbsp;·&nbsp; <strong>Severity:</strong> ${escapeForEmail(severity)}</p>
        <p><strong>${escapeForEmail(title)}</strong></p>
        <p style="white-space:pre-line;">${escapeForEmail(body)}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0;">
        <p style="font-size:12px;color:#94a3b8;">This is a report only. Nothing changes until you approve it in the Tickets queue.</p>
      </div>`,
      list.length ? { ...cfg, emailRecipients: list } : cfg,
    );
  } catch {
    // notification failure shouldn't lose the ticket
  }

  revalidatePath("/tickets");
  redirect("/tickets?sent=1");
}

/**
 * Triage a ticket: approve, decline, start, or resolve, with an optional note.
 * MANAGER/ADMIN ONLY — this is the approval gate. A rep filing a ticket can never
 * reach this; only an approver moves a ticket out of "new".
 */
export async function setTicketStatus(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return; // hard gate: reps cannot triage
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const adminNote = String(formData.get("adminNote") ?? "").trim();
  if (!id || !["new", "approved", "in_progress", "resolved", "declined"].includes(status)) return;
  await db.ticket.update({
    where: { id },
    data: { status, ...(adminNote ? { adminNote } : {}) },
  });
  revalidatePath("/tickets");
}

/** Permanently delete a ticket. MANAGER/ADMIN ONLY — for clearing duplicates/spam. */
export async function deleteTicket(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return; // hard gate
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.ticket.delete({ where: { id } });
  revalidatePath("/tickets");
}

/** Score a pasted call transcript and save the result. Any signed-in user. */
export async function scoreCall(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const transcript = String(formData.get("transcript") ?? "").trim();
  const repName = String(formData.get("repName") ?? "").trim();
  const callType = String(formData.get("callType") ?? "").trim();
  if (transcript.length < 40) redirect("/call-scoring?err=short");

  const script = callType ? await db.callScript.findUnique({ where: { callType } }) : null;
  const result = await scoreTranscript(transcript, {
    label: callType ? callTypeLabel(callType) : undefined,
    script: script?.script || undefined,
  });
  if (!result.configured) redirect("/call-scoring?setup=1");
  if (result.error) redirect(`/call-scoring?err=${encodeURIComponent(result.error)}`);

  await db.callScore.create({
    data: {
      repName: repName || "(unspecified)",
      callType,
      scoredBy: me.name,
      overall: result.overall,
      breakdown: JSON.stringify(result.breakdown),
      summary: result.summary,
      transcript: transcript.slice(0, 20000),
    },
  });
  revalidatePath("/call-scoring");
  redirect("/call-scoring?scored=1");
}

/** Save/update the approved script for a call type. Managers only. */
export async function saveCallScript(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const callType = String(formData.get("callType") ?? "").trim();
  if (!callType) return;
  const script = String(formData.get("script") ?? "").trim();
  await db.callScript.upsert({
    where: { callType },
    update: { script },
    create: { callType, script },
  });
  revalidatePath("/call-scoring");
  redirect("/call-scoring?saved=Script#scripts");
}

/** Add/edit an Operations-hub link. OWNER (admin) ONLY. */
export async function saveResource(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  let url = String(formData.get("url") ?? "").trim();
  const category = String(formData.get("category") ?? "General").trim() || "General";
  const description = String(formData.get("description") ?? "").trim();
  if (!title || !url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url; // tolerate pasted bare domains
  const data = { title, url, category, description };
  if (id) await db.resource.update({ where: { id }, data });
  else await db.resource.create({ data });
  revalidatePath("/operations");
  redirect("/operations?saved=1");
}

/** Delete an Operations-hub link. OWNER (admin) ONLY. */
export async function deleteResource(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.resource.delete({ where: { id } });
  revalidatePath("/operations");
}

/** Accept / decline / mark-done an AI suggestion. OWNER (admin/Jon) ONLY. */
export async function setSuggestionStatus(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return; // AI Updates is Jon-only
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!id || !["proposed", "accepted", "declined", "done"].includes(status)) return;
  await db.suggestion.update({ where: { id }, data: { status, ...(note ? { note } : {}) } });
  revalidatePath("/ai-updates");
}

function escapeForEmail(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Admin actions -----------------------------------------------------------

export async function saveSettings(formData: FormData) {
  const data = {
    googleChatWebhook: String(formData.get("googleChatWebhook") ?? "").trim(),
    alertEmailRecipients: String(formData.get("alertEmailRecipients") ?? "").trim(),
    emailFromAddress: String(formData.get("emailFromAddress") ?? "").trim(),
    workdayCutoff: String(formData.get("workdayCutoff") ?? "18:00").trim(),
    orgTimezone: String(formData.get("orgTimezone") ?? "America/New_York").trim(),
    annualRevenueGoal: numOrNull(formData.get("annualRevenueGoal")) ?? 0,
    weeklyEmailRecipients: String(formData.get("weeklyEmailRecipients") ?? "").trim(),
    ethanShiftIcsUrl: String(formData.get("ethanShiftIcsUrl") ?? "").trim(),
    ethanReminderEmail: String(formData.get("ethanReminderEmail") ?? "").trim(),
  };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/admin");
  redirect("/admin?saved=Settings");
}

/** Save the Monday-Meeting deck content (annual goal + editorial slides). Managers only. */
export async function saveMeetingSettings(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const data = {
    annualRevenueGoal: numOrNull(formData.get("annualRevenueGoal")) ?? 0,
    homeownersGoal: Math.round(numOrNull(formData.get("homeownersGoal")) ?? 24),
    revenueStretchGoal: numOrNull(formData.get("revenueStretchGoal")) ?? 0,
    goalReward: String(formData.get("goalReward") ?? "").trim(),
    stretchReward: String(formData.get("stretchReward") ?? "").trim(),
    mtgAnnouncements: String(formData.get("mtgAnnouncements") ?? "").trim(),
    mtgComingSoon: String(formData.get("mtgComingSoon") ?? "").trim(),
    teamMeetLink: String(formData.get("teamMeetLink") ?? "").trim(),
  };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/meeting");
  redirect("/meeting?saved=Deck+content#edit");
}

/** Save the Leadership-meeting deck content (agenda, talking points, action items). Managers only. */
export async function saveLeadershipSettings(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const data = {
    leadAgenda: String(formData.get("leadAgenda") ?? "").trim(),
    mtgTalkingPoints: String(formData.get("mtgTalkingPoints") ?? "").trim(),
    leadActionItems: String(formData.get("leadActionItems") ?? "").trim(),
    leadershipMeetLink: String(formData.get("leadershipMeetLink") ?? "").trim(),
  };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/leadership");
  redirect("/leadership?saved=Deck+content#edit");
}

/** Capture a feedback note during a meeting. Managers only. */
export async function addMeetingNote(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const text = String(formData.get("text") ?? "").trim();
  const meeting = String(formData.get("meeting") ?? "monday") === "leadership" ? "leadership" : "monday";
  if (!text) return;
  await db.meetingNote.create({ data: { text, author: me!.name, meeting } });
  const path = meeting === "leadership" ? "/leadership" : "/meeting";
  revalidatePath(path);
  redirect(`${path}?saved=Note#notes`);
}

/** Delete a meeting note. Managers only. */
export async function deleteMeetingNote(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  const meeting = String(formData.get("meeting") ?? "monday") === "leadership" ? "leadership" : "monday";
  if (id) await db.meetingNote.delete({ where: { id } });
  const path = meeting === "leadership" ? "/leadership" : "/meeting";
  revalidatePath(path);
  redirect(`${path}?saved=Note#notes`);
}

// --- Meeting recordings (Fathom links) --------------------------------------

/** File a Fathom recording link for a meeting; optionally post it to Google Chat. */
export async function addRecording(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const meeting = String(formData.get("meeting") ?? "monday") === "leadership" ? "leadership" : "monday";
  const title = String(formData.get("title") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  if (!title || !url) redirect(`/${meeting === "leadership" ? "leadership" : "meeting"}?err=rec#recordings`);
  const meetingDate = String(formData.get("meetingDate") ?? "").trim();
  const post = formData.get("postToChat") === "on";
  let posted = false;
  if (post) {
    posted = await sendGoogleChat(`🎥 *${meeting === "leadership" ? "Leadership" : "Team"} meeting recording* — ${title}\n${url}`);
  }
  await db.meetingRecording.create({ data: { meeting, title, url, meetingDate, postedToChat: posted } });
  const path = meeting === "leadership" ? "/leadership" : "/meeting";
  revalidatePath(path);
  redirect(`${path}?saved=Recording#recordings`);
}

export async function deleteRecording(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  const meeting = String(formData.get("meeting") ?? "monday") === "leadership" ? "leadership" : "monday";
  if (id) await db.meetingRecording.delete({ where: { id } });
  const path = meeting === "leadership" ? "/leadership" : "/meeting";
  revalidatePath(path);
  redirect(`${path}#recordings`);
}

// --- Change / Improvement Portal --------------------------------------------

/** Anyone signed in can request a business change (script, schedule, process…). */
export async function submitChangeRequest(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect("/change-portal?empty=1");
  const category = String(formData.get("category") ?? "other").trim() || "other";
  const body = String(formData.get("body") ?? "").trim();
  await db.changeRequest.create({ data: { submittedBy: me.name, submitterEmail: me.email, title, body, category } });
  await sendEmail(`💡 Change request from ${me.name}: ${title}`,
    alertEmailHtml(`Change request: ${title}`, [`Category: ${category}`, body || "(no details)", "Review it in the Change Portal."]));
  revalidatePath("/change-portal");
  redirect("/change-portal?sent=1");
}

/** Two-way thread: submitter or leadership adds a comment to a request. */
export async function addChangeComment(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const requestId = String(formData.get("requestId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!requestId || !body) redirect("/change-portal");
  const req = await db.changeRequest.findUnique({ where: { id: requestId } });
  if (!req) redirect("/change-portal");
  const leader = isManager(me);
  if (!leader && req!.submittedBy !== me.name) return; // only your own thread
  await db.changeComment.create({ data: { requestId, author: me.name, body, byLeadership: leader } });
  if (leader && req!.submitterEmail) {
    await sendEmailTo([req!.submitterEmail], `Re: ${req!.title}`,
      alertEmailHtml(`Update on your request: ${req!.title}`, [`${me.name}: ${body}`, "Open the Change Portal to reply."]));
  } else if (!leader) {
    // rep replied — loop in leadership
    await sendEmail(`💬 Reply on “${req!.title}” from ${me.name}`,
      alertEmailHtml(`Reply: ${req!.title}`, [`${me.name}: ${body}`, "Open the Change Portal to respond."]));
  }
  revalidatePath("/change-portal");
  redirect(`/change-portal#req-${requestId}`);
}

/** Leadership sets a request's status + review note. */
export async function setChangeStatus(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !status) redirect("/change-portal");
  const note = String(formData.get("reviewNote") ?? "").trim();
  const req = await db.changeRequest.update({ where: { id }, data: { status, ...(note ? { reviewNote: note } : {}) } });
  if (req.submitterEmail) {
    await sendEmailTo([req.submitterEmail], `Your request is now “${status}”: ${req.title}`,
      alertEmailHtml(`${req.title} → ${status}`, [note || `Status updated to ${status}.`, "Open the Change Portal for details."]));
  }
  revalidatePath("/change-portal");
  redirect(`/change-portal#req-${id}`);
}

export async function deleteChangeRequest(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.changeRequest.delete({ where: { id } });
  revalidatePath("/change-portal");
  redirect("/change-portal");
}

// --- AI Champion ------------------------------------------------------------

/** Anyone signed in can submit an AI process they built. */
export async function submitAiIdea(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect("/ai-champion?empty=1");
  const tool = String(formData.get("tool") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  await db.aiSubmission.create({ data: {
    submittedBy: me.name, submitterEmail: me.email, title, description, tool,
    hoursSaved: numOrNull(formData.get("hoursSaved")),
    proofUrl: String(formData.get("proofUrl") ?? "").trim(),
  } });
  await sendEmail(`🤖 AI Champion submission from ${me.name}: ${title}`,
    alertEmailHtml(`AI submission: ${title}`, [`Tool: ${tool || "—"}`, description || "(no description)", "Review it in AI Champion."]));
  revalidatePath("/ai-champion");
  redirect("/ai-champion?sent=1");
}

/** Leadership reviews a submission: status + reward + note. */
export async function reviewAiSubmission(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  if (!id || !status) redirect("/ai-champion");
  const sub = await db.aiSubmission.update({ where: { id }, data: {
    status,
    rewardAmount: numOrNull(formData.get("rewardAmount")),
    reviewNote: String(formData.get("reviewNote") ?? "").trim(),
  } });
  if (sub.submitterEmail) {
    const reward = sub.rewardAmount ? ` Bonus: $${Math.round(sub.rewardAmount)}.` : "";
    await sendEmailTo([sub.submitterEmail], `AI Champion: “${sub.title}” → ${status}`,
      alertEmailHtml(`${sub.title} → ${status}`, [(sub.reviewNote || `Status: ${status}.`) + reward, "Open AI Champion for details."]));
  }
  revalidatePath("/ai-champion");
  redirect(`/ai-champion#sub-${id}`);
}

export async function deleteAiSubmission(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.aiSubmission.delete({ where: { id } });
  revalidatePath("/ai-champion");
  redirect("/ai-champion");
}

// --- Team Roster (private HR) — OWNER ONLY ----------------------------------

export async function saveTeamProfile(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return; // Jon only
  const userId = String(formData.get("userId") ?? "") || null;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const data = {
    name,
    birthday: str("birthday"), phone: str("phone"), address: str("address"),
    startDate: str("startDate"), lastPromotion: str("lastPromotion"),
    payScale: str("payScale"), payPeriod: str("payPeriod"),
    payMethod: str("payMethod") || "Wise", payDetails: str("payDetails"),
    about: str("about"), performance: str("performance"),
  };
  if (userId) await db.teamProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  else await db.teamProfile.create({ data });
  revalidatePath("/team-roster");
  redirect("/team-roster?saved=1");
}

// --- EOS Rocks (quarterly priorities) ---------------------------------------

/** Add a Rock. Anyone signed in can add one they own; managers can add company
 *  rocks or assign to anyone. Quarter/due default to the current quarter. */
export async function addRock(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect("/rocks?empty=1");
  const leader = isManager(me);
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const isCompany = leader && String(formData.get("isCompany") ?? "") === "on";
  const owner = isCompany ? "" : (leader ? String(formData.get("owner") ?? "").trim() || me.name : me.name);
  const quarter = String(formData.get("quarter") ?? "").trim() || quarterOf(today);
  const dueDate = String(formData.get("dueDate") ?? "").trim() || quarterEnd(today);
  const milestones = String(formData.get("milestones") ?? "").trim();
  await db.rock.create({ data: { title, owner, isCompany, quarter, dueDate, milestones } });
  revalidatePath("/rocks");
  redirect("/rocks?saved=1");
}

/** Update a Rock's status + progress. The owner or any manager can do this. */
export async function updateRockStatus(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const rock = await db.rock.findUnique({ where: { id } });
  if (!rock) return;
  if (!isManager(me) && rock.owner !== me.name) return; // only your rock (or leadership)
  const status = String(formData.get("status") ?? rock.status).trim();
  const progressRaw = formData.get("progress");
  const progress = progressRaw != null ? Math.max(0, Math.min(100, Number(progressRaw) || 0)) : rock.progress;
  await db.rock.update({ where: { id }, data: { status, progress: status === "done" ? 100 : progress } });
  revalidatePath("/rocks");
  redirect("/rocks");
}

/** Edit a Rock's core fields — managers only. */
export async function editRock(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const isCompany = str("isCompany") === "on";
  await db.rock.update({ where: { id }, data: {
    title: str("title"), owner: isCompany ? "" : str("owner"), isCompany,
    quarter: str("quarter"), dueDate: str("dueDate"),
    milestones: str("milestones"), notes: str("notes"),
  } });
  revalidatePath("/rocks");
  redirect("/rocks");
}

/** Delete a Rock — managers only. */
export async function deleteRock(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.rock.delete({ where: { id } });
  revalidatePath("/rocks");
  redirect("/rocks");
}

// --- Software & logins directory — OWNER curates, team reads ----------------
// NOTE: there is deliberately no password field. Secrets live in the team
// password manager; this only stores where to find them.

export async function saveSoftware(formData: FormData) {
  const me = await getCurrentUser();
  if (!canCurateSoftware(me)) return;
  const id = String(formData.get("id") ?? "");
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const name = str("name");
  if (!name) return;
  const data: Record<string, unknown> = {
    name, category: str("category") || "Other", url: str("url"), loginEmail: str("loginEmail"),
    vaultRef: str("vaultRef"), vaultUrl: str("vaultUrl"), mfa: str("mfa"),
    owner: str("owner"), accessList: str("accessList"), plan: str("plan"),
    monthlyCost: str("monthlyCost"), billingCycle: str("billingCycle"), renewalDate: str("renewalDate"),
    notes: str("notes"), sortOrder: Number(formData.get("sortOrder")) || 0,
  };

  // Encrypt the password only if a new one was typed; blank leaves it unchanged.
  const secretPlain = String(formData.get("secret") ?? "");
  if (secretPlain.trim()) {
    if (!vaultConfigured()) redirect("/software?novault=1");
    data.secret = encryptSecret(secretPlain.trim());
  }

  if (id) await db.software.update({ where: { id }, data });
  else await db.software.create({ data: data as Parameters<typeof db.software.create>[0]["data"] });
  revalidatePath("/software");
  redirect("/software?saved=1");
}

/** Remove the stored password for a tool (keep the rest of the entry). */
export async function clearSecret(formData: FormData) {
  const me = await getCurrentUser();
  if (!canCurateSoftware(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.software.update({ where: { id }, data: { secret: "" } });
  revalidatePath("/software");
  redirect("/software");
}

export async function deleteSoftware(formData: FormData) {
  const me = await getCurrentUser();
  if (!canCurateSoftware(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.software.delete({ where: { id } });
  revalidatePath("/software");
  redirect("/software");
}

// --- EOS Accountability Chart (Seats + GWC) — OWNER ONLY --------------------

export async function saveSeat(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const title = str("title");
  if (!title) return;
  const parentId = str("parentId") || null;
  const sortOrder = Number(formData.get("sortOrder")) || 0;
  const data = {
    title, holder: str("holder"), roles: str("roles"), parentId, sortOrder,
    gwcGet: str("gwcGet"), gwcWant: str("gwcWant"), gwcCapacity: str("gwcCapacity"), gwcNote: str("gwcNote"),
    piProfile: str("piProfile"), piTagline: str("piTagline"), piSummary: str("piSummary"),
    iq: str("iq"), ei: str("ei"), assessedOn: str("assessedOn"), roleFit: str("roleFit"),
  };
  if (id) await db.seat.update({ where: { id }, data });
  else await db.seat.create({ data });
  revalidatePath("/team-roster");
  redirect("/team-roster?saved=1#chart");
}

export async function deleteSeat(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) {
    await db.seat.updateMany({ where: { parentId: id }, data: { parentId: null } });
    await db.seat.delete({ where: { id } });
  }
  revalidatePath("/team-roster");
  redirect("/team-roster#chart");
}

// --- EOS V/TO (Vision/Traction Organizer) — OWNER edits, team reads ---------

export async function saveVto(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return; // owner-only edit
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const data = {
    coreValues: str("coreValues"), purpose: str("purpose"), niche: str("niche"),
    tenYearTarget: str("tenYearTarget"), targetMarket: str("targetMarket"),
    uniques: str("uniques"), provenProcess: str("provenProcess"), guarantee: str("guarantee"),
    threeYrDate: str("threeYrDate"), threeYrRevenue: str("threeYrRevenue"), threeYrProfit: str("threeYrProfit"),
    threeYrMeasurables: str("threeYrMeasurables"), threeYrPicture: str("threeYrPicture"),
    oneYrDate: str("oneYrDate"), oneYrRevenue: str("oneYrRevenue"), oneYrProfit: str("oneYrProfit"),
    oneYrMeasurables: str("oneYrMeasurables"), oneYrGoals: str("oneYrGoals"),
  };
  await db.vto.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/vto");
  redirect("/vto?saved=1");
}

// --- EOS Issues + To-Dos (IDS) ----------------------------------------------

/** Raise an issue — anyone signed in. */
export async function addIssue(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect("/issues?empty=1");
  const detail = String(formData.get("detail") ?? "").trim();
  const scope = String(formData.get("scope") ?? "leadership").trim() || "leadership";
  const owner = isManager(me) ? String(formData.get("owner") ?? "").trim() : "";
  await db.issue.create({ data: { title, detail, scope, owner, raisedBy: me.name } });
  revalidatePath("/issues");
  redirect("/issues?raised=1");
}

/** Bump an issue to the top of the priority order (leadership). */
export async function bumpIssue(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const top = await db.issue.findFirst({ where: { status: "open" }, orderBy: { priority: "desc" } });
  await db.issue.update({ where: { id }, data: { priority: (top?.priority ?? 0) + 1 } });
  revalidatePath("/issues");
  redirect("/issues");
}

/** Solve an issue (IDS) — owner or leadership. Optionally spawns a To-Do. */
export async function solveIssue(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const issue = await db.issue.findUnique({ where: { id } });
  if (!issue) return;
  if (!isManager(me) && issue.owner !== me.name && issue.raisedBy !== me.name) return;
  const solveNote = String(formData.get("solveNote") ?? "").trim();
  await db.issue.update({ where: { id }, data: { status: "solved", solveNote } });

  // Solving often produces a 7-day action item.
  const todoText = String(formData.get("todoText") ?? "").trim();
  if (todoText) {
    const settings = await getSettings();
    const today = todayStr(settings.orgTimezone);
    let due = String(formData.get("todoDue") ?? "").trim();
    if (!due) {
      const d = new Date(today + "T00:00:00");
      d.setDate(d.getDate() + 7);
      due = d.toISOString().slice(0, 10);
    }
    const todoOwner = String(formData.get("todoOwner") ?? "").trim() || issue.owner;
    await db.toDo.create({ data: { text: todoText, owner: todoOwner, dueDate: due, fromIssue: id } });
  }
  revalidatePath("/issues");
  redirect("/issues");
}

/** Drop an issue without solving (not worth it / out of scope). */
export async function dropIssue(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const issue = await db.issue.findUnique({ where: { id } });
  if (!issue) return;
  if (!isManager(me) && issue.owner !== me.name && issue.raisedBy !== me.name) return;
  await db.issue.update({ where: { id }, data: { status: "dropped" } });
  revalidatePath("/issues");
  redirect("/issues");
}

/** Reopen a solved/dropped issue — leadership. */
export async function reopenIssue(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.issue.update({ where: { id }, data: { status: "open" } });
  revalidatePath("/issues");
  redirect("/issues");
}

/** Delete an issue — leadership. */
export async function deleteIssue(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.issue.delete({ where: { id } });
  revalidatePath("/issues");
  redirect("/issues");
}

/** Add a standalone To-Do — anyone signed in. */
export async function addToDo(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const text = String(formData.get("text") ?? "").trim();
  if (!text) redirect("/issues");
  const owner = String(formData.get("owner") ?? "").trim() || me.name;
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  await db.toDo.create({ data: { text, owner, dueDate } });
  revalidatePath("/issues");
  redirect("/issues");
}

/** Toggle a To-Do done/not-done — anyone signed in. */
export async function toggleToDo(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const todo = await db.toDo.findUnique({ where: { id } });
  if (todo) await db.toDo.update({ where: { id }, data: { done: !todo.done } });
  revalidatePath("/issues");
  redirect("/issues");
}

/** Delete a To-Do — leadership. */
export async function deleteToDo(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.toDo.delete({ where: { id } });
  revalidatePath("/issues");
  redirect("/issues");
}

/** Add a Monday-Meeting training tip to the backlog. Managers only. */
export async function saveTrainingTip(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const kpiKey = String(formData.get("kpiKey") ?? "").trim();
  await db.trainingTip.create({ data: { text, kpiKey } });
  revalidatePath("/meeting");
  redirect("/meeting?saved=Tip#edit");
}

/** Delete a training tip. Managers only. */
export async function deleteTrainingTip(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.trainingTip.delete({ where: { id } });
  revalidatePath("/meeting");
  redirect("/meeting?saved=Tip#edit");
}

export async function saveUser(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "rep");
  const position = String(formData.get("position") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const active = formData.get("active") === "on";
  const tracksInternet = formData.get("tracksInternet") === "on";
  if (!name || !email) return;
  const data = { name, email, role, position, note, active, tracksInternet };
  if (id) {
    await db.user.update({ where: { id }, data });
  } else {
    await db.user.create({ data });
  }
  revalidatePath("/admin");
  revalidatePath("/entry");
  revalidatePath("/dashboard");
  redirect(`/admin?saved=${encodeURIComponent(name)}`);
}

/**
 * Permanently delete a person AND all their data (entries, targets, alerts,
 * PIPs, tickets). ADMIN-ONLY and destructive — guarded so it only works on an
 * already-deactivated account, never on yourself. Use to fully purge a name
 * after they've left; export their KPI report first if you want the record.
 */
export async function deleteUser(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return; // destructive → admin only
  const id = String(formData.get("id") ?? "");
  if (!id || id === me?.id) return; // never delete yourself
  const u = await db.user.findUnique({ where: { id } });
  if (!u || u.active) return; // must be deactivated first (safety)

  // Remove dependent rows before the user (FK), scoped to this one person.
  await db.entry.deleteMany({ where: { userId: id } });
  await db.target.deleteMany({ where: { userId: id } });
  await db.alert.deleteMany({ where: { userId: id } });
  await db.pip.deleteMany({ where: { userId: id } });
  await db.ticket.deleteMany({ where: { userId: id } });
  await db.user.delete({ where: { id } });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect(`/admin?saved=${encodeURIComponent(u.name + " removed")}`);
}

export async function saveKpi(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const goalRaw = String(formData.get("goalValue") ?? "").trim();
  const unit = String(formData.get("unit") ?? "count") as Unit;
  // Goal is shown in display units; convert duration minutes back to seconds.
  let goalValue: number | null = null;
  if (goalRaw !== "") {
    const n = Number(goalRaw.replace(/[$,%\s]/g, ""));
    if (!Number.isNaN(n)) goalValue = unit === "duration" ? n * 60 : n;
  }
  const goalKind = String(formData.get("goalKind") ?? "at_least");
  const data = {
    category: String(formData.get("category") ?? "blue"),
    roleKey: String(formData.get("roleKey") ?? ""),
    goalKind,
    goalValue: goalKind === "tracked" ? null : goalValue,
    active: formData.get("active") === "on",
  };
  await db.kpi.update({ where: { id }, data });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/entry");
  redirect("/admin?saved=KPI");
}

export async function createKpi(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const unit = String(formData.get("unit") ?? "count") as Unit;
  const scope = String(formData.get("scope") ?? "per_rep");
  const goalKind = String(formData.get("goalKind") ?? "at_least");
  const goalRaw = String(formData.get("goalValue") ?? "").trim();
  let goalValue: number | null = null;
  if (goalKind !== "tracked" && goalRaw !== "") {
    const n = Number(goalRaw.replace(/[$,%\s]/g, ""));
    if (!Number.isNaN(n)) goalValue = unit === "duration" ? n * 60 : n;
  }
  // Build a stable, unique key slug from the name.
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  let key = base || `kpi_${Date.now()}`;
  if (await db.kpi.findUnique({ where: { key } })) key = `${base}_${Date.now()}`;
  const max = await db.kpi.aggregate({ _max: { sortOrder: true } });

  await db.kpi.create({
    data: {
      key,
      name,
      emoji: String(formData.get("emoji") ?? "").trim(),
      category: String(formData.get("category") ?? "blue"),
      unit,
      scope,
      roleKey: scope === "per_rep" ? String(formData.get("roleKey") ?? "") : "",
      cadence: String(formData.get("cadence") ?? "daily"),
      goalKind,
      goalValue,
      definition: String(formData.get("definition") ?? "").trim(),
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/entry");
  redirect(`/admin?saved=${encodeURIComponent(name)}`);
}

// --- Deals (Dispositions board) ---------------------------------------------

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/[$,\s]/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Create or update a deal. */
export async function saveDeal(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const address = String(formData.get("address") ?? "").trim();
  if (!address) return;
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const data = {
    address,
    status: str("status") || "under_contract",
    assignedTo: str("assignedTo"),
    buyerName: str("buyerName"),
    contractPrice: numOrNull(formData.get("contractPrice")),
    askingPrice: numOrNull(formData.get("askingPrice")),
    soldPrice: numOrNull(formData.get("soldPrice")),
    assignmentFee: numOrNull(formData.get("assignmentFee")),
    dealType: str("dealType"),
    source: str("source"),
    lmAq: str("lmAq"),
    contractDate: str("contractDate"),
    contractExpiration: str("contractExpiration"),
    onMarketSince: str("onMarketSince"),
    listingSignedDate: str("listingSignedDate"),
    listingExpiration: str("listingExpiration"),
    soldDate: str("soldDate"),
    nextSteps: str("nextSteps"),
    notes: str("notes"),
  };
  if (id) {
    await db.deal.update({ where: { id }, data });
  } else {
    await db.deal.create({ data });
  }
  revalidatePath("/deals");
  revalidatePath("/report");
  redirect("/deals?saved=1");
}

/** Archive a deal (soft-delete: hides from board, keeps history). */
export async function archiveDeal(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await db.deal.update({ where: { id }, data: { active: false } });
  revalidatePath("/deals");
  revalidatePath("/report");
  redirect("/deals?saved=1");
}

/**
 * Mark a pipeline deal CLOSED — verified by a required HUD upload.
 * Dispo reps + managers + owner can run it. Creates the ClosedDeal ledger entry
 * (with the HUD stored as proof + lead source / acquisition cost), then pulls
 * the deal off the active board.
 */
export async function closeDeal(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !(isManager(me) || me.position === "dispositions")) return;

  const dealId = String(formData.get("dealId") ?? "");
  const deal = dealId ? await db.deal.findUnique({ where: { id: dealId } }) : null;
  if (!deal) redirect("/deals?err=missing");

  const closeDate = String(formData.get("closeDate") ?? "").trim(); // YYYY-MM-DD
  const profit = numOrNull(formData.get("profit"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closeDate) || profit === null) redirect("/deals?err=fields");

  // HUD upload is the authentication gate — no proof, no close.
  const hud = formData.get("hud");
  if (!(hud instanceof File) || hud.size === 0) redirect("/deals?err=hud");
  const file = hud as File;
  if (file.size > 4 * 1024 * 1024) redirect("/deals?err=size");
  const okType = /pdf|image\//.test(file.type);
  if (!okType) redirect("/deals?err=type");
  const hudData = Buffer.from(await file.arrayBuffer());

  const dt = closeDate as string;
  const year = Number(dt.slice(0, 4));
  const month = Number(dt.slice(5, 7));
  const dealType = String(formData.get("dealType") ?? "assignment").trim() || "assignment";
  const leadSource = String(formData.get("leadSource") ?? "").trim();
  const acquisitionCost = numOrNull(formData.get("acquisitionCost"));
  const notes = String(formData.get("notes") ?? "").trim();

  let created = true;
  try {
    await db.closedDeal.create({
      data: {
        address: deal!.address,
        closeDate: dt,
        year,
        month,
        dealType,
        profit: profit as number,
        leadSource,
        acquisitionCost,
        notes,
        closedBy: me.name,
        dealId: deal!.id,
        hudData,
        hudName: file.name,
        hudType: file.type,
      },
    });
  } catch {
    created = false; // most likely the (address, closeDate) unique guard
  }
  if (!created) redirect("/deals?err=dup");

  await db.deal.update({
    where: { id: deal!.id },
    data: { status: "closed", soldDate: dt, assignmentFee: profit, active: false },
  });
  revalidatePath("/deals");
  revalidatePath("/closed-deals");
  revalidatePath("/trends");
  redirect("/deals?closed=1");
}

/** Save a one-off internet speed-test result as today's internet_speed KPI. */
export async function saveSpeedTest(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const date = String(formData.get("date") ?? "");
  const mbps = Number(formData.get("mbps"));
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(mbps)) return;
  const kpi = await db.kpi.findUnique({ where: { key: "internet_speed" } });
  if (!kpi) return;
  const existing = await db.entry.findFirst({ where: { kpiId: kpi.id, userId, date } });
  if (existing) {
    await db.entry.update({ where: { id: existing.id }, data: { value: mbps, enteredBy: "speedtest" } });
  } else {
    await db.entry.create({ data: { kpiId: kpi.id, userId, date, value: mbps, enteredBy: "speedtest" } });
  }
  // Instant alert if below goal (it's a soft/blue KPI but still flags).
  const created = await evaluateAndRecordAlerts(date, [kpi.id]);
  await dispatchHardAlerts(created);
  revalidatePath("/entry");
  revalidatePath("/dashboard");
}

// --- PIP (Performance Improvement Plan) -------------------------------------

/** Open a new PIP for a rep+KPI (typically from a flagged candidate). */
export async function openPip(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const kpiKey = String(formData.get("kpiKey") ?? "");
  const kpiName = String(formData.get("kpiName") ?? "").trim();
  if (!userId || !kpiKey) return;
  const reason = String(formData.get("reason") ?? "").trim();
  const goalNote = String(formData.get("goalNote") ?? "").trim();
  const plan = String(formData.get("plan") ?? "").trim();
  const support = String(formData.get("support") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const reviewDate = String(formData.get("reviewDate") ?? "").trim();
  // Don't duplicate an open PIP for the same rep+KPI.
  const existing = await db.pip.findFirst({ where: { userId, kpiKey, status: "open" } });
  if (existing) { revalidatePath("/pip"); redirect("/pip?saved=1"); }
  await db.pip.create({
    data: { userId, kpiKey, kpiName, reason, goalNote, plan, support, startDate, reviewDate, stage: "coaching", status: "open" },
  });

  // Generate a SUPPORTIVE draft email addressed to the rep, and send it to the
  // admin recipients (you) to review/edit/send — NOT auto-sent to the rep.
  const rep = await db.user.findUnique({ where: { id: userId } });
  if (rep && String(formData.get("emailDraft")) === "on") {
    const draft = buildPipDraft({
      repName: rep.name,
      repEmail: rep.email,
      kpiName,
      goalNote,
      plan,
      support,
      reviewDate,
    });
    const cfg = await getChannelConfig();
    const settings = await db.settings.findUnique({ where: { id: 1 } });
    const list = (settings?.weeklyEmailRecipients || cfg.emailRecipients.join(","))
      .split(/[,;\s]+/).map((x: string) => x.trim()).filter(Boolean);
    await sendEmail(
      `📝 DRAFT for ${rep.name}: ${draft.subject}`,
      draft.html,
      list.length ? { ...cfg, emailRecipients: list } : cfg,
    );
  }

  revalidatePath("/pip");
  redirect("/pip?saved=1");
}

/** Update an existing PIP (plan text, consequence, dates). */
export async function updatePip(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.pip.update({
    where: { id },
    data: {
      goalNote: String(formData.get("goalNote") ?? "").trim(),
      plan: String(formData.get("plan") ?? "").trim(),
      support: String(formData.get("support") ?? "").trim(),
      consequence: String(formData.get("consequence") ?? "").trim(),
      reviewDate: String(formData.get("reviewDate") ?? "").trim(),
    },
  });
  revalidatePath("/pip");
  redirect("/pip?saved=1");
}

/** Add a dated check-in note to a PIP. */
export async function addPipCheckin(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  if (!id || !note) return;
  const pip = await db.pip.findUnique({ where: { id } });
  if (!pip) return;
  const checkins = JSON.parse(pip.checkins || "[]");
  checkins.push({ date, note });
  await db.pip.update({ where: { id }, data: { checkins: JSON.stringify(checkins) } });
  revalidatePath("/pip");
  redirect("/pip?saved=1");
}

/** Advance a PIP to the next stage, or resolve/close it. */
export async function advancePip(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? ""); // advance | resolve | close
  if (!id) return;
  const pip = await db.pip.findUnique({ where: { id } });
  if (!pip) return;
  if (action === "resolve") {
    await db.pip.update({ where: { id }, data: { status: "resolved", stage: "closed" } });
  } else if (action === "close") {
    await db.pip.update({ where: { id }, data: { status: "escalated", stage: "closed" } });
  } else {
    // advance to next stage
    const order = ["coaching", "pip", "final", "closed"];
    const i = order.indexOf(pip.stage);
    const next = i >= 0 && i < order.length - 1 ? order[i + 1] : "closed";
    await db.pip.update({ where: { id }, data: { stage: next } });
  }
  revalidatePath("/pip");
  redirect("/pip?saved=1");
}

// --- Marketing directory + research (manager-curated) -----------------------

export async function saveMarketContact(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const name = str("name");
  if (!name) return;
  const num = (k: string) => { const v = parseFloat(String(formData.get(k) ?? "")); return Number.isFinite(v) ? v : null; };
  const data = {
    name, category: str("category") === "luxury" ? "luxury" : "distressed",
    type: str("type"), region: str("region"), market: str("market"), status: str("status"),
    email: str("email"), phone: str("phone"), website: str("website"),
    buyBox: str("buyBox"), buyBoxAreas: str("buyBoxAreas"),
    lat: num("lat"), lng: num("lng"), notes: str("notes"),
    sortOrder: Number(formData.get("sortOrder")) || 0,
  };
  if (id) await db.marketContact.update({ where: { id }, data });
  else await db.marketContact.create({ data });
  revalidatePath("/marketing");
  redirect("/marketing?saved=1");
}

export async function deleteMarketContact(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.marketContact.delete({ where: { id } });
  revalidatePath("/marketing");
  redirect("/marketing");
}

export async function saveMarketingNotes(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const data = {
    marketingMarkets: String(formData.get("marketingMarkets") ?? "").trim(),
    marketingResearch: String(formData.get("marketingResearch") ?? "").trim(),
  };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/marketing");
  redirect("/marketing?saved=1");
}

// --- Roadmap / backlog (manager-curated) ------------------------------------

export async function saveRoadmapItem(formData: FormData) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const title = str("title");
  if (!title) return;
  const data = { title, detail: str("detail"), category: str("category") || "Other", status: str("status") || "todo", sortOrder: Number(formData.get("sortOrder")) || 0 };
  if (id) await db.roadmapItem.update({ where: { id }, data });
  else await db.roadmapItem.create({ data });
  revalidatePath("/roadmap");
  redirect("/roadmap?saved=1");
}

/** Cycle a roadmap item's status: todo -> doing -> done -> todo. */
export async function cycleRoadmapStatus(formData: FormData) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const item = await db.roadmapItem.findUnique({ where: { id } });
  if (!item) return;
  const next = item.status === "todo" ? "doing" : item.status === "doing" ? "done" : "todo";
  await db.roadmapItem.update({ where: { id }, data: { status: next } });
  revalidatePath("/roadmap");
  redirect("/roadmap");
}

export async function deleteRoadmapItem(formData: FormData) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.roadmapItem.delete({ where: { id } });
  revalidatePath("/roadmap");
  redirect("/roadmap");
}
