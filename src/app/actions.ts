"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { fromInput, type Unit } from "@/lib/format";
import { dispatchHardAlerts, evaluateAndRecordAlerts } from "@/lib/alerts";
import { buildPipDraft } from "@/lib/pip";
import { getChannelConfig, sendEmail, sendEmailTo, alertEmailHtml, sendTeamChat, sendTimecardChat, sendCallAuditChat } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManager, isAdmin, isOwner, canCurateSoftware, canAccessMarketing, canAccessPayroll, canTrackTime } from "@/lib/auth";
import { isExcusedReason } from "@/lib/alert-resolution";
import { scoreTranscript } from "@/lib/score";
import { callTypeLabel } from "@/lib/call-types";
import { getSettings } from "@/lib/data";
import { rollupResearchKpis, orgToday } from "@/lib/research-kpis";
import { migrateScoreById } from "@/lib/recording-migrate";
import { zonedTime } from "@/lib/shift";
import { writeDay as crmWriteDay, writeOpps as crmWriteOpps, writeActivity as crmWriteActivity } from "@/lib/crm-sync";
import { after } from "next/server";

/** Pull today's CRM numbers (calls + offers/contracts) on demand so the scorecard
 *  is live right now. Managers only. */
/** Owner sends themselves a test email to confirm Resend is wired correctly. */
export async function sendTestEmail() {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  const ok = await sendEmailTo([me!.email], "✅ War Room — Resend test", "<p>If you're reading this, your email alerts (Resend) are working. 🎉</p><p>— The War Room</p>");
  redirect(`/system-check?email=${ok ? "ok" : "fail"}`);
}

export async function refreshCrmToday() {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const settings = await getSettings();
  const tz = settings.orgTimezone;
  const today = todayStr(tz);
  const calls = await crmWriteDay(today, tz);
  const opps = await crmWriteOpps(today, tz);
  await crmWriteActivity(today, calls.wrote, opps);
  revalidatePath("/report");
  revalidatePath("/dashboard");
  // No redirect — refresh in place so it works from either page.
}
import { todayStr } from "@/lib/date";
import { quarterOf, quarterEnd } from "@/lib/eos";
import { encryptSecret, vaultConfigured } from "@/lib/crypto";
import { adminConfigured, createAdminClient, findAuthUserByEmail } from "@/lib/supabase/admin";
import { createTimeOffEvent, deleteTimeOffEvent } from "@/lib/gcal";

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

/** Owner: create a brand-new login (User row + Supabase password) in one step. */
export async function createTeamLogin(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  if (!adminConfigured()) redirect("/admin?pwerr=nokey#access");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = ["rep", "manager", "admin"].includes(String(formData.get("role"))) ? String(formData.get("role")) : "rep";
  const password = String(formData.get("password") ?? "");
  if (!name || !email) redirect("/admin?pwerr=1#access");
  if (password.length < 8) redirect("/admin?pwerr=short#access");
  // Create or update the app User row so they're recognized after sign-in.
  await db.user.upsert({ where: { email }, update: { name, role, active: true }, create: { name, email, role } });
  // Create or update the Supabase auth user with the password.
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

/** Admin: set a person's editable access toggles (C-Suite, pay, marketing). */
export async function saveUserAccess(formData: FormData) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return;
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  // Per-section menu access: anything offered but not checked becomes hidden for them.
  let navHidden = "";
  try {
    const available: string[] = JSON.parse(String(formData.get("navAvailable") ?? "[]")) || [];
    const shown = new Set(formData.getAll("navShow").map(String));
    navHidden = JSON.stringify(available.filter((h) => !shown.has(h)));
  } catch { navHidden = ""; }
  await db.user.update({
    where: { id: userId },
    data: {
      accessCsuite: formData.get("accessCsuite") === "on",
      accessPayroll: formData.get("accessPayroll") === "on",
      accessMarketing: formData.get("accessMarketing") === "on",
      navHidden,
    },
  });
  revalidatePath("/admin/access-preview");
  redirect(`/admin/access-preview?as=${userId}&saved=1`);
}

/** Save (or clear) the rep's own Gemini API key for call transcription (BYOK), so
 *  their uploads run on their quota instead of the shared key. */
export async function saveGeminiKey(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const key = String(formData.get("geminiKey") ?? "").trim().slice(0, 200);
  await db.user.update({ where: { id: me.id }, data: { geminiKey: key } });
  redirect("/account?gemini=" + (key ? "saved" : "cleared"));
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
  const keyById = new Map(kpis.map((k) => [k.id, k.key]));
  const SIGNED_KEYS = new Set(["acq_signed_assignment", "acq_signed_novation", "acq_signed_listing", "acq_signed_creative"]);
  const wins: { key: string; n: number; userId: string | null }[] = []; // newly-signed contracts to celebrate

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
    // A signed-contract count that went UP = a fresh win worth celebrating.
    const k = keyById.get(kpiId);
    if (k && SIGNED_KEYS.has(k) && value > (existing?.value ?? 0)) wins.push({ key: k, n: value - (existing?.value ?? 0), userId });
  }

  // 🎉 Positive ping: celebrate newly-signed contracts in the team Google Chat.
  for (const w of wins) {
    const u = w.userId ? await db.user.findUnique({ where: { id: w.userId }, select: { name: true } }) : null;
    const who = u?.name?.split(" ")[0] ?? "The team";
    const type = w.key.replace("acq_signed_", "");
    await sendTeamChat(`🎉 *Contract signed!* ${who} just locked up ${w.n > 1 ? `${w.n} ${type} contracts` : `a ${type} contract`} — let's go! 🔥`).catch(() => {});
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

/** Auto-save ONE KPI value as the user types (no click needed). Persists to the DB so the
 *  number survives leaving the screen — but skips the wins-chat + alert dispatch, which only
 *  fire on the explicit "Save day" finalize so they don't spam on every keystroke. */
export async function autoSaveEntry(formData: FormData) {
  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const enteredBy = String(formData.get("enteredBy") ?? "");
  const kpiId = String(formData.get("kpiId") ?? "");
  const userId = String(formData.get("userId") ?? "") || null;
  if (!kpiId) return;
  const kpi = await db.kpi.findUnique({ where: { id: kpiId }, select: { unit: true } });
  if (!kpi) return;
  const value = fromInput(kpi.unit as Unit, String(formData.get("value") ?? ""));
  const existing = await db.entry.findFirst({ where: { kpiId, userId, date } });
  if (value === null) {
    if (existing) await db.entry.delete({ where: { id: existing.id } }); // blank clears it
  } else if (existing) {
    await db.entry.update({ where: { id: existing.id }, data: { value, enteredBy, enteredAt: new Date() } });
  } else {
    await db.entry.create({ data: { kpiId, userId, date, value, enteredBy } });
  }
  revalidatePath("/entry");
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
        <p><strong>${escapeForEmail(me.name)}</strong> reported an issue with the War Room.</p>
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
  // One recording can hold several calls — score against each selected type.
  const callTypes = Array.from(new Set(formData.getAll("callType").map((v) => String(v).trim()).filter(Boolean)));
  if (callTypes.length === 0) callTypes.push(""); // no type chosen → generic score
  if (transcript.length < 40) redirect("/call-scoring?err=short");

  const audioUrl = String(formData.get("audioUrl") ?? "").trim().slice(0, 500);
  // The recording itself is required — a transcript alone isn't enough to verify the call.
  if (!audioUrl) redirect("/call-scoring?err=noaudio");
  const address = String(formData.get("address") ?? "").trim().slice(0, 200);
  const sellerName = String(formData.get("sellerName") ?? "").trim().slice(0, 120);
  const sellerPhone = String(formData.get("sellerPhone") ?? "").trim().slice(0, 40);
  const direction = String(formData.get("direction") ?? "").trim(); // inbound | outbound

  for (const callType of callTypes) {
    const script = callType ? await db.callScript.findUnique({ where: { callType } }) : null;
    const result = await scoreTranscript(transcript, {
      label: callType ? callTypeLabel(callType) : undefined,
      script: script?.script || undefined,
    });
    if (!result.configured) redirect("/call-scoring?setup=1");
    if (result.error) redirect(`/call-scoring?err=${encodeURIComponent(result.error)}`);

    const created = await db.callScore.create({
      data: {
        repName: repName || "(unspecified)", callType, direction, address, sellerName, sellerPhone,
        scoredBy: me.name,
        overall: result.overall,
        breakdown: JSON.stringify(result.breakdown),
        summary: result.summary,
        transcript: transcript.slice(0, 20000),
        audioUrl,
      },
    });
    // Post each score (+ a link to the recording) to the Call Audit Google Chat space.
    if (audioUrl) {
      const label = callType ? callTypeLabel(callType) : "Call";
      await sendCallAuditChat(`🎧 *Call scored — ${repName || "rep"}* · ${label} · *${result.overall}/100*\n▶️ Listen: ${audioUrl}`).catch(() => {});
      after(() => migrateScoreById(created.id).catch(() => {}));
    }
  }
  revalidatePath("/call-scoring");
  redirect("/call-scoring?scored=1");
}

/** Delete a scored call + its recording from storage (frees Supabase space).
 *  The scorer or a manager can delete (handy for duplicate uploads). */
export async function deleteCallScore(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const score = await db.callScore.findUnique({ where: { id }, select: { audioUrl: true, scoredBy: true } });
  if (!score) return;
  if (!isManager(me) && me.name !== score.scoredBy) return; // own calls or managers
  // Remove the audio file from Supabase Storage so it doesn't keep costing space.
  const marker = "/call-recordings/";
  const idx = score.audioUrl ? score.audioUrl.indexOf(marker) : -1;
  if (idx >= 0 && adminConfigured()) {
    const path = score.audioUrl.slice(idx + marker.length);
    try { await createAdminClient().storage.from("call-recordings").remove([path]); } catch {}
  }
  await db.callScore.delete({ where: { id } });
  revalidatePath("/call-scoring");
  redirect("/call-scoring");
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
    timecardChatWebhook: String(formData.get("timecardChatWebhook") ?? "").trim(),
    callAuditChatWebhook: String(formData.get("callAuditChatWebhook") ?? "").trim(),
    alertEmailRecipients: String(formData.get("alertEmailRecipients") ?? "").trim(),
    emailFromAddress: String(formData.get("emailFromAddress") ?? "").trim(),
    workdayCutoff: String(formData.get("workdayCutoff") ?? "18:00").trim(),
    orgTimezone: String(formData.get("orgTimezone") ?? "America/New_York").trim(),
    annualRevenueGoal: numOrNull(formData.get("annualRevenueGoal")) ?? 0,
    weeklyEmailRecipients: String(formData.get("weeklyEmailRecipients") ?? "").trim(),
  };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/admin");
  redirect("/admin?saved=Settings");
}

/** Save the Monday-Meeting deck content (annual goal + editorial slides). Managers only. */
export async function saveMeetingSettings(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  // Annual goal is intentionally NOT editable here — it stays fixed all year. Only the
  // editorial slides + meet links are saved, so the goal values in Settings are never
  // touched (frozen at their current values).
  const data = {
    mtgAnnouncements: String(formData.get("mtgAnnouncements") ?? "").trim(),
    mtgComingSoon: String(formData.get("mtgComingSoon") ?? "").trim(),
    teamMeetLink: String(formData.get("teamMeetLink") ?? "").trim(),
    huddleMeetLink: String(formData.get("huddleMeetLink") ?? "").trim(),
  };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/meeting");
  redirect("/meeting?saved=Deck+content#edit");
}

// ===== Monday deck editor (owner-editable slides) =====

/** Save the uploaded Title + Team slide images (blank = revert to built-in). Managers only. */
export async function saveDeckImages(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const data = {
    titleSlideUrl: String(formData.get("titleSlideUrl") ?? "").trim().slice(0, 600),
    teamSlideUrl: String(formData.get("teamSlideUrl") ?? "").trim().slice(0, 600),
  };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/meeting");
  redirect("/meeting?saved=Slide+images#slides");
}

/** Add a custom slide (uploaded image, or a title + text). Managers only. */
export async function addDeckSlide(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const kind = String(formData.get("kind") ?? "image") === "text" ? "text" : "image";
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const body = String(formData.get("body") ?? "").trim().slice(0, 1200);
  const imageUrl = String(formData.get("imageUrl") ?? "").trim().slice(0, 600);
  if (kind === "image" && !imageUrl) redirect("/meeting?err=noimage#slides");
  if (kind === "text" && !title && !body) redirect("/meeting?err=notext#slides");
  const max = await db.deckSlide.aggregate({ _max: { sortOrder: true } });
  await db.deckSlide.create({ data: { kind, title, body, imageUrl, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  revalidatePath("/meeting");
  redirect("/meeting?saved=Slide+added#slides");
}

/** Reorder (up/down) or show/hide a custom slide. Managers only. */
export async function updateDeckSlide(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  const op = String(formData.get("op") ?? "");
  const row = id ? await db.deckSlide.findUnique({ where: { id } }) : null;
  if (!row) return;
  if (op === "toggle") {
    await db.deckSlide.update({ where: { id }, data: { active: !row.active } });
  } else if (op === "up" || op === "down") {
    const all = await db.deckSlide.findMany({ orderBy: { sortOrder: "asc" } });
    const i = all.findIndex((s) => s.id === id);
    const j = op === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < all.length) {
      await db.deckSlide.update({ where: { id: all[i].id }, data: { sortOrder: all[j].sortOrder } });
      await db.deckSlide.update({ where: { id: all[j].id }, data: { sortOrder: all[i].sortOrder } });
    }
  }
  revalidatePath("/meeting");
}

/** Delete a custom slide. Managers only. */
export async function deleteDeckSlide(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.deckSlide.delete({ where: { id } }).catch(() => {});
  revalidatePath("/meeting");
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
    posted = await sendTeamChat(`🎥 *${meeting === "leadership" ? "Leadership" : "Team"} meeting recording* — ${title}\n${url}`);
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
 * Revoke a person's access NOW (offboarding / insider-threat kill switch).
 * Deactivates them in-app (signed out on next request) AND bans their Supabase
 * login so a saved password or live session can't get back in. Owner-only.
 */
export async function revokeTeamAccess(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id || id === me.id) return; // never lock yourself out
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return;
  await db.user.update({ where: { id }, data: { active: false } });
  if (adminConfigured() && u.email) {
    const authId = await findAuthUserByEmail(u.email);
    if (authId) {
      const admin = createAdminClient();
      await admin.auth.admin.updateUserById(authId, { ban_duration: "876000h" }).catch(() => {});
    }
  }

  // Spin up a mandatory offboarding checklist — fixed steps + every shared tool
  // this person had access to (so passwords get changed / access removed).
  const first = u.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const software = await db.software.findMany({ select: { name: true, accessList: true } });
  const shared = software.filter((s) => (s.accessList || "").toLowerCase().includes(first) || (s.accessList || "").toLowerCase().includes(u.name.toLowerCase()));
  const fixed = [
    "✅ App (War Room) access revoked — confirm they're locked out",
    "Remove Google Workspace / Gmail account access (Admin console)",
    "Change the shared Gmail / email password",
    "Remove them from all Google Chat spaces",
    "Remove from shared Google Drive folders & Calendars",
    "Reassign their active deals & leads to another rep",
    "Collect any company devices / equipment",
  ];
  const fromTools = shared.map((s) => `Change password & remove access — ${s.name}`);
  // Always remind about the core shared tools even if not in the registry yet.
  const core = ["PropStream", "Batch Dialer", "CRM (REI Reply)"].filter((n) => !shared.some((s) => s.name.toLowerCase().includes(n.split(" ")[0].toLowerCase())));
  const coreTasks = core.map((n) => `Change password & remove access — ${n}`);
  const labels = [...fixed, ...fromTools, ...coreTasks];
  await db.offboarding.create({
    data: { userId: u.id, name: u.name, startedBy: me.name, tasks: { create: labels.map((label, i) => ({ label, sortOrder: i })) } },
  });

  revalidatePath("/admin");
  redirect("/admin?saved=Access%20revoked%20%E2%80%94%20complete%20the%20offboarding%20checklist#offboarding");
}

export async function toggleOffboardingTask(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const task = await db.offboardingTask.findUnique({ where: { id } });
  if (!task) return;
  const done = !task.done;
  await db.offboardingTask.update({ where: { id }, data: { done, doneAt: done ? new Date() : null } });
  // Mark the whole offboarding complete when nothing is left.
  const remaining = await db.offboardingTask.count({ where: { offboardingId: task.offboardingId, done: false } });
  await db.offboarding.update({ where: { id: task.offboardingId }, data: { completedAt: remaining === 0 ? new Date() : null } });
  revalidatePath("/admin");
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
  // Resolve the internet-speed KPI the same way the entry card binds to it — by
  // roleKey "internet" — falling back to the legacy "internet_speed" slug. The
  // card shows whenever a roleKey="internet" KPI exists, but the row's generated
  // key can differ (e.g. admin-created), which previously made saves silently no-op.
  const kpi =
    (await db.kpi.findFirst({ where: { roleKey: "internet" }, orderBy: { sortOrder: "asc" } })) ??
    (await db.kpi.findUnique({ where: { key: "internet_speed" } }));
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
  const decisionMaker = str("decisionMaker");
  // Their CRM rule: a buyer who isn't the direct decision maker is a B-rated buyer.
  let status = str("status");
  if (!status && /not direct/i.test(decisionMaker)) status = "B-rated";
  const data = {
    name, category: str("category") === "luxury" ? "luxury" : "distressed",
    type: str("type"), region: str("region"), market: str("market"), status,
    vetStage: str("vetStage") || "to_vet",
    email: str("email"), phone: str("phone"), website: str("website"),
    buyBox: str("buyBox"), buyBoxAreas: str("buyBoxAreas"),
    igHandle: str("igHandle"), bestContact: str("bestContact"),
    lastContacted: str("lastContacted"), nextFollowUp: str("nextFollowUp"), outreachLog: str("outreachLog"),
    lat: num("lat"), lng: num("lng"), notes: str("notes"),
    // structured buy-box (shared)
    company: str("company"), title: str("title"), preferredContact: str("preferredContact"),
    decisionMaker, buyingFrequency: str("buyingFrequency"), priceRange: str("priceRange"), closingSpeed: str("closingSpeed"),
    // developer
    dealType: str("dealType"), buildType: str("buildType"), minLotSize: str("minLotSize"),
    // flipper
    marketDetails: str("marketDetails"), minBeds: str("minBeds"), maxBaths: str("maxBaths"),
    propertyType: str("propertyType"), conditionTolerance: str("conditionTolerance"), needsView: str("needsView"),
    sortOrder: Number(formData.get("sortOrder")) || 0,
  };
  if (id) {
    await db.marketContact.update({ where: { id }, data });
  } else {
    // New buyer added via the full form — credit the rep so "New Buyers Added"
    // (and "Buy Boxes Captured" if a box was filled) auto-tracks like the other paths.
    const today = orgToday((await getSettings()).orgTimezone);
    const hasBox = !!(data.buyBox || data.buyBoxAreas || data.priceRange || data.minLotSize);
    await db.marketContact.create({
      data: {
        ...data,
        addedById: me!.id, addedOn: today,
        ...(hasBox ? { boxById: me!.id, boxOn: today } : {}),
      },
    });
    await rollupResearchKpis(me!.id, today);
  }
  revalidatePath("/marketing");
  revalidatePath("/vetting");
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

/** Move a vetting prospect to a new stage (vetted / to_vet / hold / dead).
 *  Promoting to "vetted" is what graduates them into Markets & Buyers. */
export async function setBuyerStage(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!id || !["to_vet", "vetted", "active", "hold", "dead"].includes(stage)) return;
  const today = orgToday((await getSettings()).orgTimezone);
  const prev = await db.marketContact.findUnique({ where: { id }, select: { vetStage: true } });
  const data: { vetStage: string; vettedById?: string; vettedOn?: string } = { vetStage: stage };
  if (stage === "vetted" && prev?.vetStage !== "vetted") { data.vettedById = me!.id; data.vettedOn = today; }
  await db.marketContact.update({ where: { id }, data });
  await rollupResearchKpis(me!.id, today);
  revalidatePath("/vetting");
  revalidatePath("/marketing");
}

/** Single Status dropdown on the vetting spreadsheet. Working statuses keep them
 *  in the pipeline; "vetted" graduates them to Markets & Buyers; "not_interested"
 *  archives them. */
export async function setBuyerStatus(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id) return;
  const WORKING = ["to_contact", "contacted", "messaged", "following_up"];
  const today = orgToday((await getSettings()).orgTimezone);
  if (WORKING.includes(status)) {
    await db.marketContact.update({ where: { id }, data: { vetStatus: status, vetStage: "to_vet" } });
  } else if (status === "vetted") {
    const prev = await db.marketContact.findUnique({ where: { id }, select: { vetStage: true } });
    await db.marketContact.update({ where: { id }, data: { vetStage: "vetted", ...(prev?.vetStage !== "vetted" ? { vettedById: me!.id, vettedOn: today } : {}) } });
  } else if (status === "not_interested") {
    await db.marketContact.update({ where: { id }, data: { vetStage: "dead" } });
  } else return;
  await rollupResearchKpis(me!.id, today);
  revalidatePath("/vetting");
  revalidatePath("/marketing");
}

/** Permanently delete a buyer/prospect from Buyer Research. */
export async function deleteProspect(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.marketContact.delete({ where: { id } });
  revalidatePath("/vetting");
  revalidatePath("/marketing");
}

/** Inline single-cell autosave from the spreadsheet view. Revalidates without a
 *  redirect so editing feels live (no page jump). */
export async function saveProspectField(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "").slice(0, 4000);
  const ALLOWED = ["name", "phone", "phone2", "email", "website", "links", "buyBoxAreas", "outreachLog"];
  if (!id || !ALLOWED.includes(field)) return;
  if (field === "name" && !value.trim()) return;
  await db.marketContact.update({ where: { id }, data: { [field]: value } });
  // NO revalidatePath here on purpose: this is an inline autosave and the field already
  // shows the typed value on the client. Revalidating re-renders the whole page, which
  // jumps the scroll back to the top and adds a visible lag on every keystroke-save.
}

/** Save the CRM buy-box detail for a Buyer Research row (the expandable panel):
 *  type (developer vs fix/flip) + the dropdown fields, matching the CRM form. */
export async function saveBuyerBox(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const g = (k: string) => String(formData.get(k) ?? "").slice(0, 300);
  const category = g("category") === "luxury" ? "luxury" : "distressed";
  // "Buy box captured" = at least one real buy-box field is filled. Stamp the first
  // time it happens so it counts once toward the rep's Buy Boxes Captured KPI.
  const hasBox = [g("dealType"), g("buildType"), g("priceRange"), g("minLotSize"), g("propertyType"), g("conditionTolerance"), g("buyingFrequency")].some((x) => x.trim());
  const prev = await db.marketContact.findUnique({ where: { id }, select: { boxOn: true } });
  const today = orgToday((await getSettings()).orgTimezone);
  await db.marketContact.update({
    where: { id },
    data: {
      category,
      type: category === "luxury" ? "developer" : "flipper",
      title: g("title"), company: g("company"), preferredContact: g("preferredContact"),
      dealType: g("dealType"), buildType: g("buildType"), closingSpeed: g("closingSpeed"),
      priceRange: g("priceRange"), minLotSize: g("minLotSize"),
      propertyType: g("propertyType"), minBeds: g("minBeds"), maxBaths: g("maxBaths"),
      conditionTolerance: g("conditionTolerance"), needsView: g("needsView"), marketDetails: g("marketDetails"),
      decisionMaker: g("decisionMaker"), buyingFrequency: g("buyingFrequency"), bestContact: g("bestContact"),
      companySize: g("companySize"),
      ...(hasBox && !prev?.boxOn ? { boxById: me!.id, boxOn: today } : {}),
    },
  });
  if (hasBox && !prev?.boxOn) await rollupResearchKpis(me!.id, today);
  revalidatePath("/vetting");
}

/** Inline-edit a prospect's core fields from the spreadsheet (name, contact, area). */
export async function saveProspect(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim().slice(0, 200),
    phone: String(formData.get("phone") ?? "").trim().slice(0, 120),
    email: String(formData.get("email") ?? "").trim().slice(0, 200),
    website: String(formData.get("website") ?? "").trim().slice(0, 400),
    buyBoxAreas: String(formData.get("buyBoxAreas") ?? "").trim().slice(0, 400),
    nextFollowUp: String(formData.get("nextFollowUp") ?? "").trim().slice(0, 10),
  };
  if (!data.name) return;
  if (id) {
    await db.marketContact.update({ where: { id }, data });
  } else {
    // New row — needs a target area. Credit the rep who added it (auto KPI).
    const vetArea = String(formData.get("vetArea") ?? "").trim().slice(0, 200);
    const today = orgToday((await getSettings()).orgTimezone);
    await db.marketContact.create({ data: { ...data, vetArea, category: "luxury", type: "developer", vetStage: "to_vet", vetStatus: "to_contact", addedById: me!.id, addedOn: today } });
    await rollupResearchKpis(me!.id, today);
  }
  revalidatePath("/vetting");
  revalidatePath("/marketing");
}

/** Log an outreach touch on a prospect: stamps last-contacted = today, appends the
 *  note to the running log, and sets the next follow-up. Mirrors a KPI touch
 *  (Buyers Contacted) so the dispo effort is captured where they actually work. */
export async function logBuyerOutreach(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const settings = await getSettings();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(new Date());
  const next = new Date(); next.setDate(next.getDate() + 3);
  const nextStr = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(next);
  const existing = await db.marketContact.findUnique({ where: { id }, select: { outreachLog: true, touchOn: true } });
  // One touch per lead per day — pressing 📇 again on the same lead doesn't re-count or
  // re-log. Notes still autosave separately; this just protects Developers Contacted.
  if (existing?.touchOn === today) { revalidatePath("/vetting"); revalidatePath("/marketing"); return; }
  const stamped = note ? `${today}: ${note}` : `${today}: reached out`;
  const log = existing?.outreachLog ? `${stamped}\n${existing.outreachLog}` : stamped;
  await db.marketContact.update({ where: { id }, data: { lastContacted: today, nextFollowUp: nextStr, outreachLog: log.slice(0, 4000), vetStatus: "contacted", touchById: me!.id, touchOn: today } });
  await rollupResearchKpis(me!.id, today); // → Developers Contacted
  revalidatePath("/vetting");
  revalidatePath("/marketing");
}

/** Create or edit a Target Market (neighborhood/farm). Managers/marketing only. */
export async function saveTargetMarket(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 160);
  if (!name) return;
  const num = (k: string) => { const v = parseFloat(String(formData.get(k) ?? "")); return Number.isFinite(v) ? v : null; };
  const data = {
    name,
    region: String(formData.get("region") ?? "").trim().slice(0, 40),
    tier: String(formData.get("tier") ?? "").trim().slice(0, 4),
    score: Math.round(num("score") ?? 0),
    summary: String(formData.get("summary") ?? "").trim().slice(0, 2000),
    neighborhoods: String(formData.get("neighborhoods") ?? "").trim().slice(0, 4000),
    developers: String(formData.get("developers") ?? "").trim().slice(0, 4000),
    lat: num("lat"), lng: num("lng"),
    sortOrder: Math.round(num("sortOrder") ?? 0),
  };
  if (id) await db.targetMarket.update({ where: { id }, data });
  else await db.targetMarket.create({ data });
  revalidatePath("/marketing");
  redirect("/marketing?saved=1");
}

export async function deleteTargetMarket(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.targetMarket.delete({ where: { id } });
  revalidatePath("/marketing");
  redirect("/marketing?saved=1");
}

/** Team 360 — save one person's read on a teammate (or themselves) for the current quarter.
 *  Any signed-in teammate can submit; upserts so editing just updates their row. */
export async function savePeerAssessment(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const subjectId = String(formData.get("subjectId") ?? "");
  if (!subjectId) return;
  const settings = await getSettings();
  const quarter = quarterOf(todayStr(settings.orgTimezone));
  const t = (k: string, n = 600) => String(formData.get(k) ?? "").trim().slice(0, n);
  const rate = (k: string) => { const x = Math.round(Number(formData.get(k) ?? 0)); return x >= 1 && x <= 5 ? x : 0; };
  const data = {
    superpower: t("superpower", 200), strengths: t("strengths"), growth: t("growth"),
    rComm: rate("rComm"), rFollow: rate("rFollow"), rSkill: rate("rSkill"), rCoach: rate("rCoach"), rCulture: rate("rCulture"),
  };
  await db.peerAssessment.upsert({
    where: { quarter_raterId_subjectId: { quarter, raterId: me.id, subjectId } },
    update: data,
    create: { quarter, raterId: me.id, subjectId, ...data },
  });
  revalidatePath("/team-360");
  redirect(`/team-360?saved=${subjectId}#rate`);
}

/** JV partners — OTHER wholesalers/partners who hold buy boxes of developers we don't have
 *  direct access to. We send them deals, they route to their buyers, and we JV 50/50. Stored
 *  as MarketContact rows with type "jv_partner" so they stay completely separate from our
 *  vetted buyers/developers (never counted as developer outreach, never shown as a real buyer). */
export async function saveJvPartner(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  const t = (k: string, n = 300) => String(formData.get(k) ?? "").trim().slice(0, n);
  const name = t("name", 160);
  if (!name) return;
  const data = {
    name,
    company: t("company", 160),
    email: t("email", 160),
    phone: t("phone", 60),
    region: t("region", 60),
    market: t("market", 160),
    buyBox: t("buyBox", 4000),   // which developer buy boxes they can move
    notes: t("notes", 4000),     // JV terms, who they represent, etc.
    type: "jv_partner",
    category: "jv",
    vetStage: "active",
  };
  if (id) {
    const row = await db.marketContact.findUnique({ where: { id }, select: { type: true } });
    if (row?.type !== "jv_partner") return; // guard: only edit JV partners here
    await db.marketContact.update({ where: { id }, data });
  } else {
    await db.marketContact.create({ data });
  }
  revalidatePath("/marketing");
  redirect("/marketing?saved=1");
}

/** Save (or clear) a vetted buyer's buy-box AREA MAP — the detailed map Sharyn makes showing
 *  exactly where they buy. Stored in the dormant `contact` column (no schema change needed), so
 *  it survives buyer edits (saveMarketContact never writes `contact`) and shows on the big map. */
export async function saveBuyBoxMap(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  const mapUrl = String(formData.get("mapUrl") ?? "").trim().slice(0, 1000);
  if (!id) return;
  await db.marketContact.update({ where: { id }, data: { contact: mapUrl } });
  revalidatePath("/marketing");
  redirect("/marketing?saved=1#buybox-maps");
}

export async function deleteJvPartner(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const row = await db.marketContact.findUnique({ where: { id }, select: { type: true } });
  if (row?.type !== "jv_partner") return; // safety: this action only removes JV partners
  await db.marketContact.delete({ where: { id } });
  revalidatePath("/marketing");
  redirect("/marketing?saved=1");
}

export async function saveMarketingNotes(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const data = {
    marketingMarkets: String(formData.get("marketingMarkets") ?? "").trim(),
    marketingResearch: String(formData.get("marketingResearch") ?? "").trim(),
    outreachTemplates: String(formData.get("outreachTemplates") ?? "").trim(),
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

// --- Markets & Buyers: CSV bulk import (dispo team) --------------------------

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === "\r") { /* skip */ }
      else cell += c;
    }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/** Bulk-add vetted developers/flippers from a CSV (file upload or pasted text). */
export async function importMarketContacts(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const file = formData.get("file") as File | null;
  let text = String(formData.get("csv") ?? "");
  if (file && typeof file.size === "number" && file.size > 0) text = await file.text();
  if (!text.trim()) redirect("/marketing?imp=empty");

  const rows = parseCsvRows(text);
  if (rows.length < 2) redirect("/marketing?imp=empty");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };
  const col = {
    name: idx(["name", "company", "builder"]), category: idx(["category"]), type: idx(["type", "tier"]),
    region: idx(["region"]), market: idx(["market", "city", "primary city"]), status: idx(["status"]),
    email: idx(["email"]), phone: idx(["phone"]), website: idx(["website", "web"]),
    buyBox: idx(["buybox", "buy box"]), areas: idx(["buyboxareas", "areas", "target areas", "target geography", "preferred markets", "neighborhoods"]),
    lat: idx(["lat"]), lng: idx(["lng", "lon"]), notes: idx(["notes"]),
    ig: idx(["ig", "instagram", "ighandle", "handle"]), best: idx(["bestcontact", "best contact", "best way"]),
    company: idx(["company", "dev firm", "firm"]), title: idx(["title", "role"]),
    preferredContact: idx(["preferredcontact", "preferred contact", "preferred contact method"]),
    decisionMaker: idx(["decisionmaker", "decision maker"]), buyingFrequency: idx(["buyingfrequency", "buying frequency"]),
    priceRange: idx(["pricerange", "price range", "price range per lot", "price range buy box"]), closingSpeed: idx(["closingspeed", "closing speed", "move speed"]),
    dealType: idx(["dealtype", "deal type"]), buildType: idx(["buildtype", "build type"]), minLotSize: idx(["minlotsize", "minimum lot size", "min lot"]),
    marketDetails: idx(["marketdetails", "market details"]), minBeds: idx(["minbeds", "minimum bedrooms", "min beds"]),
    maxBaths: idx(["maxbaths", "maximum bathrooms", "max baths"]), propertyType: idx(["propertytype", "property type", "property buy box type"]),
    conditionTolerance: idx(["conditiontolerance", "condition tolerance"]), needsView: idx(["needsview", "needs to view", "needs to view before offer"]),
    vetStage: idx(["vetstage", "vet stage", "vetting stage", "stage"]),
  };
  if (col.name < 0) redirect("/marketing?imp=noname");
  const stageKey = (s: string) => {
    const t = s.trim().toLowerCase();
    if (/vetted/.test(t)) return "vetted";
    if (/active/.test(t)) return "active";
    if (/hold/.test(t)) return "hold";
    if (/dead/.test(t)) return "dead";
    return "to_vet";
  };

  let n = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const g = (i: number) => (i >= 0 && i < row.length ? row[i].trim() : "");
    const name = g(col.name);
    if (!name) continue;
    const latV = parseFloat(g(col.lat)); const lngV = parseFloat(g(col.lng));
    const dm = g(col.decisionMaker);
    let status = g(col.status);
    if (!status && /not direct/i.test(dm)) status = "B-rated";
    await db.marketContact.create({ data: {
      name, category: g(col.category).toLowerCase() === "luxury" ? "luxury" : "distressed",
      type: g(col.type), region: g(col.region), market: g(col.market), status,
      vetStage: col.vetStage >= 0 ? stageKey(g(col.vetStage)) : "to_vet",
      email: g(col.email), phone: g(col.phone), website: g(col.website),
      buyBox: g(col.buyBox), buyBoxAreas: g(col.areas), notes: g(col.notes),
      igHandle: g(col.ig), bestContact: g(col.best),
      company: g(col.company), title: g(col.title), preferredContact: g(col.preferredContact),
      decisionMaker: dm, buyingFrequency: g(col.buyingFrequency), priceRange: g(col.priceRange), closingSpeed: g(col.closingSpeed),
      dealType: g(col.dealType), buildType: g(col.buildType), minLotSize: g(col.minLotSize),
      marketDetails: g(col.marketDetails), minBeds: g(col.minBeds), maxBaths: g(col.maxBaths),
      propertyType: g(col.propertyType), conditionTolerance: g(col.conditionTolerance), needsView: g(col.needsView),
      lat: Number.isFinite(latV) ? latV : null, lng: Number.isFinite(lngV) ? lngV : null,
    } });
    n++;
  }
  revalidatePath("/marketing");
  redirect(`/marketing?imp=${n}`);
}

// --- Schedule + Time card ----------------------------------------------------

const PUNCH_KINDS = ["in", "out", "break_start", "break_end", "lunch_start", "lunch_end", "meeting_start", "meeting_end", "appointment_start", "appointment_end", "errand_start", "errand_end", "training_start", "training_end", "bathroom_start", "bathroom_end"];

/** Record a time-card punch (clock in/out, break/lunch/meeting) for the current user. */
const PUNCH_CHAT: Record<string, string> = {
  in: "🟢 {name} clocked in",
  out: "⚪️ {name} ended the day",
  break_start: "🟡 {name} started a break",
  break_end: "🟢 {name} is back from break",
  lunch_start: "🍽️ {name} went to lunch",
  lunch_end: "🟢 {name} is back from lunch",
  meeting_start: "🟣 {name} is in a meeting",
  meeting_end: "🟢 {name} is out of their meeting",
  appointment_start: "🗓️ {name} is at an appointment",
  appointment_end: "🟢 {name} is back from their appointment",
  errand_start: "🚗 {name} is running an errand",
  errand_end: "🟢 {name} is back from their errand",
  training_start: "🎓 {name} is in training",
  training_end: "🟢 {name} is done with training",
  bathroom_start: "💩 {name} is on a bathroom break",
  bathroom_end: "🟢 {name} is back from the bathroom",
};

/** Current local time as minutes-from-midnight in the org timezone. */
function nowLocalMin(tz: string): number {
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export async function punch(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const kind = String(formData.get("kind") ?? "");
  if (!PUNCH_KINDS.includes(kind)) return;
  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  // Idempotency: ignore an accidental double-tap or a network retry of the SAME punch
  // within ~45s (this is what was double-posting "back from break" for flaky connections).
  const dup = await db.punch.findFirst({ where: { userId: me.id, date, kind, at: { gte: new Date(Date.now() - 45000) } }, select: { id: true } });
  if (dup) { revalidatePath("/schedule"); revalidatePath("/timecard"); return; }
  await db.punch.create({ data: { userId: me.id, kind, date } });
  // Logging back in auto-clears any live outage flagged for them. Atomic guard: only the
  // call that actually flips ongoing→false posts the "BACK online" message, so the 5
  // possible senders (punch / heartbeat / endOutage / presence) can't double-post.
  if (kind === "in") {
    const first = await db.outage.findFirst({ where: { userId: me.id, date, ongoing: true }, select: { kind: true } });
    const res = await db.outage.updateMany({ where: { userId: me.id, date, ongoing: true }, data: { ongoing: false, endMin: nowLocalMin(settings.orgTimezone) } });
    if (res.count > 0 && first) {
      const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.orgTimezone });
      sendTimecardChat(`🟢 ${me.name} is BACK online — ${first.kind === "power" ? "⚡ power" : "📶 internet"} outage cleared · ${t}`).catch(() => {});
    }
  }
  // Mirror the status change to the team Google Chat room (replaces the manual
  // "on break / back from lunch" typing the team used to do).
  const tmpl = PUNCH_CHAT[kind];
  if (tmpl) {
    const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.orgTimezone });
    sendTimecardChat(`${tmpl.replace("{name}", me.name)} · ${time}`).catch(() => {});
  }
  revalidatePath("/schedule");
}

/** Submit a time-off / day-off request for the current user. */
export async function requestTimeOff(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const type = String(formData.get("type") ?? "vacation");
  const startDate = String(formData.get("startDate") ?? "");
  let endDate = String(formData.get("endDate") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) endDate = startDate;
  // Managers' own requests are auto-approved; everyone else starts as requested.
  const status = isManager(me) ? "approved" : "requested";
  const row = await db.timeOff.create({ data: { userId: me.id, type, startDate, endDate, note, status } });
  if (status === "approved") {
    const eventId = await createTimeOffEvent({ name: me.name, type, startDate, endDate, note }).catch(() => null);
    if (eventId) await db.timeOff.update({ where: { id: row.id }, data: { gcalEventId: eventId } });
  }
  revalidatePath("/schedule");
}

/** Approve or deny a time-off request (managers only). */
export async function setTimeOffStatus(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["approved", "denied", "requested"].includes(status)) return;
  const row = await db.timeOff.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!row) return;
  await db.timeOff.update({ where: { id }, data: { status } });
  // Sync Google Calendar: create on approve, remove if un-approved.
  if (status === "approved" && !row.gcalEventId) {
    const eventId = await createTimeOffEvent({ name: row.user.name, type: row.type, startDate: row.startDate, endDate: row.endDate, note: row.note }).catch(() => null);
    if (eventId) await db.timeOff.update({ where: { id }, data: { gcalEventId: eventId } });
  } else if (status !== "approved" && row.gcalEventId) {
    await deleteTimeOffEvent(row.gcalEventId).catch(() => {});
    await db.timeOff.update({ where: { id }, data: { gcalEventId: "" } });
  }
  revalidatePath("/schedule");
}

/** Delete a time-off entry (its owner, or any manager). */
export async function deleteTimeOff(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const row = await db.timeOff.findUnique({ where: { id } });
  if (!row) return;
  if (row.userId !== me.id && !isManager(me)) return;
  if (row.gcalEventId) await deleteTimeOffEvent(row.gcalEventId).catch(() => {});
  await db.timeOff.delete({ where: { id } });
  revalidatePath("/schedule");
}

// --- Team documents (signed agreements) — owner only -------------------------

export async function uploadTeamDoc(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const label = String(formData.get("label") ?? "").trim() || "Signed agreement";
  const file = formData.get("file");
  if (!userId || !(file instanceof File) || file.size === 0) redirect("/team-roster?err=file");
  const f = file as File;
  if (f.size > 15 * 1024 * 1024) redirect("/team-roster?err=size");
  const data = Buffer.from(await f.arrayBuffer());
  await db.teamDoc.create({
    data: { userId, label, filename: f.name, contentType: f.type || "application/octet-stream", size: f.size, data, uploadedBy: me.name },
  });
  revalidatePath("/team-roster");
  redirect("/team-roster?saved=Document");
}

export async function deleteTeamDoc(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.teamDoc.delete({ where: { id } });
  revalidatePath("/team-roster");
}

// --- Time card / payroll (Jon / Viktoriia / Enrico) --------------------------

export async function saveTimeAdjustment(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const deductHours = Math.max(0, parseFloat(String(formData.get("deductHours") ?? "0")) || 0);
  const status = String(formData.get("status") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  await db.timeAdjustment.upsert({
    where: { userId_date: { userId, date } },
    update: { deductHours, status, note },
    create: { userId, date, deductHours, status, note },
  });
  revalidatePath("/timecard");
}

export async function saveBonus(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const periodKey = String(formData.get("periodKey") ?? "");
  const amount = parseFloat(String(formData.get("amount") ?? "0")) || 0;
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  if (!userId || !periodKey || amount === 0) return;
  await db.bonus.create({ data: { userId, periodKey, amount, note } });
  revalidatePath("/timecard");
}

export async function deleteBonus(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.bonus.delete({ where: { id } });
  revalidatePath("/timecard");
}

/** Marie's authoritative paid hours for a person+period (source of truth for pay). */
export async function savePayHours(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const periodKey = String(formData.get("periodKey") ?? "");
  if (!userId || !periodKey) return;
  const raw = String(formData.get("manualHours") ?? "").trim();
  const manualHours = raw === "" ? null : Math.max(0, parseFloat(raw) || 0);
  await db.payEntry.upsert({
    where: { userId_periodKey: { userId, periodKey } },
    update: { manualHours },
    create: { userId, periodKey, manualHours },
  });
  revalidatePath("/timecard");
}

/** $ discrepancy / clawback for a person+period (the Excel "Discrepancies" column). Leadership only. */
export async function savePayDiscrepancy(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const periodKey = String(formData.get("periodKey") ?? "");
  if (!userId || !periodKey) return;
  const adjustAmount = parseFloat(String(formData.get("adjustAmount") ?? "0")) || 0;
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  await db.payEntry.upsert({
    where: { userId_periodKey: { userId, periodKey } },
    update: { adjustAmount, note },
    create: { userId, periodKey, adjustAmount, note },
  });
  revalidatePath("/timecard");
}

const HHMM = /^(\d{1,2}):(\d{2})$/;
/** Convert an "HH:MM" manager-entered time to a punch timestamp today (org tz), or undefined. */
function punchAtFrom(atStr: string, date: string, tz: string): Date | undefined {
  const mins = toMinutes(atStr);
  if (mins === null) return undefined;
  return zonedTime(date, Math.floor(mins / 60), mins % 60, tz);
}

function toMinutes(s: string): number | null {
  const m = HHMM.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Self-report a power / internet outage during a shift (unpaid time). */
/** Manager: put someone on break/lunch they forgot to log — records the punch live so
 *  the board shows it and it counts as unpaid time. End it when they're back. */
export async function startBreakFor(formData: FormData) {
  const me = await getCurrentUser();
  if (!canTrackTime(me)) return; // managers + pay staff
  const userId = String(formData.get("userId") ?? "");
  const kind = String(formData.get("kind")) === "lunch" ? "lunch" : "break";
  if (!userId) return;
  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const last = await db.punch.findFirst({ where: { userId, date }, orderBy: { at: "desc" }, select: { kind: true } });
  if (last && (last.kind === "break_start" || last.kind === "lunch_start" || last.kind === "meeting_start")) return; // already on a break/lunch
  const at = punchAtFrom(String(formData.get("at") ?? ""), date, settings.orgTimezone); // optional manager-entered start time
  await db.punch.create({ data: { userId, kind: `${kind}_start`, date, ...(at ? { at } : {}) } });
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.orgTimezone });
  sendTimecardChat(`${kind === "lunch" ? "🍔" : "☕"} ${u?.name ?? "Team member"} is on ${kind} (logged by ${me!.name.split(" ")[0]}) · ${time}`).catch(() => {});
  revalidatePath("/schedule"); revalidatePath("/timecard");
}

export async function endBreakFor(formData: FormData) {
  const me = await getCurrentUser();
  if (!canTrackTime(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const kind = String(formData.get("kind")) === "lunch" ? "lunch" : "break";
  if (!userId) return;
  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const last = await db.punch.findFirst({ where: { userId, date }, orderBy: { at: "desc" }, select: { kind: true } });
  if (!last || last.kind !== `${kind}_start`) return; // not currently on that break/lunch
  const at = punchAtFrom(String(formData.get("at") ?? ""), date, settings.orgTimezone); // optional time they got back
  await db.punch.create({ data: { userId, kind: `${kind}_end`, date, ...(at ? { at } : {}) } });
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.orgTimezone });
  sendTimecardChat(`🟢 ${u?.name ?? "Team member"} back from ${kind} · ${time}`).catch(() => {});
  revalidatePath("/schedule"); revalidatePath("/timecard");
}

/** Manager: log a break/lunch that already happened AND ended — someone forgot to clock it.
 *  Records both the start (from) and the came-back time (to) in one shot, so the whole
 *  window is captured as unpaid time without them ever showing "on break" mid-fix. */
export async function logCompletedBreak(formData: FormData) {
  const me = await getCurrentUser();
  if (!canTrackTime(me)) return; // managers + pay staff
  const userId = String(formData.get("userId") ?? "");
  const kind = String(formData.get("kind")) === "lunch" ? "lunch" : "break";
  if (!userId) return;
  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const from = punchAtFrom(String(formData.get("from") ?? ""), date, settings.orgTimezone);
  const to = punchAtFrom(String(formData.get("to") ?? ""), date, settings.orgTimezone);
  if (!from || !to || to.getTime() <= from.getTime()) return; // need a valid window (came back after they left)
  await db.punch.create({ data: { userId, kind: `${kind}_start`, date, at: from } });
  await db.punch.create({ data: { userId, kind: `${kind}_end`, date, at: to } });
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.orgTimezone });
  sendTimecardChat(`${kind === "lunch" ? "🍔" : "☕"} ${u?.name ?? "Team member"} ${kind} ${fmt(from)}–${fmt(to)} (logged by ${me!.name.split(" ")[0]})`).catch(() => {});
  revalidatePath("/schedule"); revalidatePath("/timecard");
}

/** Manager: end someone's shift for the day (clock them out) — e.g. they went home sick.
 *  Flips them to offline on the board and stops their worked-time clock. */
export async function endShiftFor(formData: FormData) {
  const me = await getCurrentUser();
  if (!canTrackTime(me)) return; // managers + pay staff
  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 40); // optional, e.g. "sick"
  if (!userId) return;
  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const last = await db.punch.findFirst({ where: { userId, date }, orderBy: { at: "desc" }, select: { kind: true } });
  if (last?.kind === "out") return; // already ended for the day
  const at = punchAtFrom(String(formData.get("at") ?? ""), date, settings.orgTimezone); // optional time they left
  // Backdating "off for the day": any break/lunch/meeting logged at or after that time
  // no longer applies (they went home), so drop it — otherwise the later punch would keep
  // them showing "on break" instead of flipping to off. Only touches at-or-after punches.
  if (at) await db.punch.deleteMany({ where: { userId, date, at: { gte: at }, kind: { not: "in" } } });
  await db.punch.create({ data: { userId, kind: "out", date, ...(at ? { at } : {}) } });
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.orgTimezone });
  sendTimecardChat(`🔴 ${u?.name ?? "Team member"} is off for the rest of the day${reason ? ` (${reason})` : ""} — ended by ${me!.name.split(" ")[0]} · ${time}`).catch(() => {});
  revalidatePath("/schedule"); revalidatePath("/timecard");
}

export async function reportOutage(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const settings = await getSettings();
  const date = String(formData.get("date") ?? "") || todayStr(settings.orgTimezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const kind = ["internet", "power", "other"].includes(String(formData.get("kind"))) ? String(formData.get("kind")) : "internet";
  const startMin = toMinutes(String(formData.get("start") ?? ""));
  const endMin = toMinutes(String(formData.get("end") ?? ""));
  if (startMin === null || endMin === null || endMin <= startMin) return;
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  // System's last heartbeat for this rep today — to cross-check the reported start.
  const detectedMin = me.lastSeenAt ? localMinOf(me.lastSeenAt.getTime(), settings.orgTimezone) : null;
  await db.outage.create({ data: { userId: me.id, date, kind, startMin, endMin, detectedMin: detectedMin ?? undefined, note } });
  revalidatePath("/schedule");
  revalidatePath("/timecard");
}

export async function deleteOutage(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const row = await db.outage.findUnique({ where: { id } });
  if (!row) return;
  if (row.userId !== me.id && !canTrackTime(me)) return;
  await db.outage.delete({ where: { id } });
  revalidatePath("/schedule");
  revalidatePath("/timecard");
}

/** Manager taps a button to flag a live outage for a rep (start time = now).
 *  It clears automatically when they punch back in, or a manager ends it. */
export async function startOutage(formData: FormData) {
  const me = await getCurrentUser();
  if (!canTrackTime(me)) return; // managers + pay staff
  const userId = String(formData.get("userId") ?? "");
  const kind = ["internet", "power", "other"].includes(String(formData.get("kind"))) ? String(formData.get("kind")) : "power";
  if (!userId) return;
  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const existing = await db.outage.findFirst({ where: { userId, date, kind, ongoing: true } });
  if (existing) return; // already flagged
  const now = nowLocalMin(settings.orgTimezone);
  // Cross-check against the system's last heartbeat: if they already went silent, use that
  // real drop time as the outage start (so the reported time matches the detected disconnect).
  const u0 = await db.user.findUnique({ where: { id: userId }, select: { name: true, lastSeenAt: true } });
  const detectedMin = u0?.lastSeenAt ? localMinOf(u0.lastSeenAt.getTime(), settings.orgTimezone) : null;
  const enteredMin = toMinutes(String(formData.get("at") ?? "")); // optional manager-entered start time
  const startMin = enteredMin ?? (detectedMin !== null && now - detectedMin >= 5 ? detectedMin : now);
  await db.outage.create({ data: { userId, date, kind, startMin, endMin: Math.max(startMin + 1, now), detectedMin: detectedMin ?? undefined, ongoing: true, reportedBy: me!.name } });
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.orgTimezone });
  sendTimecardChat(`🔴 ${u?.name ?? "Team member"} is OFFLINE — ${kind === "power" ? "⚡ power" : kind === "internet" ? "📶 internet"  : ""} outage · ${time}`).catch(() => {});
  revalidatePath("/schedule");
  revalidatePath("/timecard");
}

/** Local minutes-from-midnight for an arbitrary epoch, in the org timezone. */
function localMinOf(ms: number, tz: string): number {
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/** The rep confirms a detected drop was a power/internet outage — records the window. */
export async function confirmDropOutage(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const kind = ["power", "internet", "other"].includes(String(formData.get("kind"))) ? String(formData.get("kind")) : "internet";
  const sinceMs = parseInt(String(formData.get("sinceMs") ?? ""), 10);
  if (!Number.isFinite(sinceMs)) return;
  const settings = await getSettings();
  const date = todayStr(settings.orgTimezone);
  const startMin = localMinOf(sinceMs, settings.orgTimezone);
  const endMin = Math.max(startMin + 1, nowLocalMin(settings.orgTimezone));
  await db.outage.create({ data: { userId: me.id, date, kind, startMin, endMin, detectedMin: startMin, ongoing: false, reportedBy: "auto-detected", note: "Dropped offline — confirmed by rep." } });
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.orgTimezone });
  sendTimecardChat(`🟢 ${me.name} is BACK online — had a ${kind === "power" ? "⚡ power" : "📶 internet"} outage (~${endMin - startMin} min) · ${time}`).catch(() => {});
  revalidatePath("/schedule");
  revalidatePath("/timecard");
}

/** Manager marks a live outage resolved (rep back online). */
export async function endOutage(formData: FormData) {
  const me = await getCurrentUser();
  if (!canTrackTime(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const settings = await getSettings();
  const row = await db.outage.findUnique({ where: { id } });
  // Only post if THIS call is the one that flips it off (count guard) — prevents the
  // manager's "Back online" + the heartbeat auto-clear from both posting.
  const res = await db.outage.updateMany({ where: { id, ongoing: true }, data: { ongoing: false, endMin: nowLocalMin(settings.orgTimezone) } });
  if (res.count > 0 && row) {
    const u = await db.user.findUnique({ where: { id: row.userId }, select: { name: true } });
    const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: settings.orgTimezone });
    sendTimecardChat(`🟢 ${u?.name ?? "Team member"} is BACK online — ${row.kind === "power" ? "⚡ power" : "📶 internet"} outage cleared · ${time}`).catch(() => {});
  }
  revalidatePath("/schedule");
  revalidatePath("/timecard");
}

// --- Escrow & Closing tracker (managers) --------------------------------------

const EXITS = ["assignment", "novation", "flip", "listing", "creative", "other"];
const CLOSING_STATUSES = ["escrow", "closed", "fell_through"];

export async function saveClosing(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim().slice(0, 200);
  if (!address) return;
  const data = {
    address,
    buyer: String(formData.get("buyer") ?? "").trim().slice(0, 160),
    exit: EXITS.includes(String(formData.get("exit"))) ? String(formData.get("exit")) : "assignment",
    status: CLOSING_STATUSES.includes(String(formData.get("status"))) ? String(formData.get("status")) : "escrow",
    revenue: Math.max(0, parseFloat(String(formData.get("revenue") ?? "0")) || 0),
    source: ["ppl", "sms", "mail", "cold_call", "referral", "other", ""].includes(String(formData.get("source"))) ? String(formData.get("source")) : "",
    market: String(formData.get("market") ?? "").trim().slice(0, 80),
    falloutReason: String(formData.get("falloutReason") ?? "").trim().slice(0, 80),
    openedDate: String(formData.get("openedDate") ?? "").trim(),
    closeDate: String(formData.get("closeDate") ?? "").trim(),
    note: String(formData.get("note") ?? "").trim().slice(0, 500),
  };
  if (id) await db.closing.update({ where: { id }, data });
  else await db.closing.create({ data });
  revalidatePath("/closing");
}

export async function deleteClosing(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.closing.delete({ where: { id } });
  revalidatePath("/closing");
}

export async function addClosingExpense(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const closingId = String(formData.get("closingId") ?? "");
  const label = String(formData.get("label") ?? "").trim().slice(0, 120);
  const amount = Math.max(0, parseFloat(String(formData.get("amount") ?? "0")) || 0);
  if (!closingId || !label || amount === 0) return;
  await db.closingExpense.create({ data: { closingId, label, amount } });
  revalidatePath("/closing");
}

export async function deleteClosingExpense(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.closingExpense.delete({ where: { id } });
  revalidatePath("/closing");
}

// --- Team & individual rewards -----------------------------------------------

export async function saveReward(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return; // C-suite only (Jon / Viktoriia / Enrico)
  const id = String(formData.get("id") ?? "").trim();
  const reward = String(formData.get("reward") ?? "").trim().slice(0, 200);
  if (!reward) return;
  const scope = String(formData.get("scope")) === "individual" ? "individual" : "team";
  const data = {
    scope,
    userId: scope === "individual" ? String(formData.get("userId") ?? "").trim() : "",
    goal: String(formData.get("goal") ?? "").trim().slice(0, 200),
    reward,
    icon: String(formData.get("icon") ?? "🎁").trim().slice(0, 8) || "🎁",
  };
  if (id) await db.reward.update({ where: { id }, data });
  else await db.reward.create({ data });
  revalidatePath("/rewards");
}

export async function toggleRewardAchieved(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const r = await db.reward.findUnique({ where: { id } });
  if (!r) return;
  await db.reward.update({ where: { id }, data: { achieved: !r.achieved } });
  revalidatePath("/rewards");
}

export async function deleteReward(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.reward.delete({ where: { id } });
  revalidatePath("/rewards");
}

/** Any team member submits a reward they'd love to earn. */
export async function submitRewardWish(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const text = String(formData.get("text") ?? "").trim().slice(0, 300);
  if (!text) return;
  await db.rewardWish.create({ data: { userId: me.id, name: me.name, text } });
  revalidatePath("/rewards");
}

export async function deleteRewardWish(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const w = await db.rewardWish.findUnique({ where: { id } });
  if (!w) return;
  if (w.userId !== me.id && !canAccessPayroll(me)) return; // own wish or C-suite
  await db.rewardWish.delete({ where: { id } });
  revalidatePath("/rewards");
}

// --- C-suite expense tracker (P&L) -------------------------------------------

const num = (fd: FormData, key: string): number => {
  const v = String(fd.get(key) ?? "").replace(/[$,\s]/g, "");
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Bulk-save every line's numbers for a month, plus net sales. C-suite only. */
export async function saveExpensesBulk(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return;

  const monthNote = String(formData.get("note") ?? "").slice(0, 4000);
  await db.expenseMonth.upsert({
    where: { month },
    update: { netSales: num(formData, "netSales"), note: monthNote },
    create: { month, netSales: num(formData, "netSales"), note: monthNote },
  });

  const lines = await db.expenseLine.findMany({ where: { month }, select: { id: true } });
  await Promise.all(
    lines.map((l) => {
      const wtRaw = String(formData.get(`withTax_${l.id}`) ?? "").replace(/[$,\s]/g, "");
      const withTax = wtRaw === "" ? null : (Number.isFinite(parseFloat(wtRaw)) ? parseFloat(wtRaw) : null);
      return db.expenseLine.update({
        where: { id: l.id },
        data: {
          projected: num(formData, `projected_${l.id}`),
          actual: num(formData, `actual_${l.id}`),
          withTax,
          note: String(formData.get(`note_${l.id}`) ?? "").trim().slice(0, 200),
        },
      });
    }),
  );
  revalidatePath("/expenses");
}

/** Add a custom line item to a category. C-suite only. */
export async function addExpenseLine(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const month = String(formData.get("month") ?? "");
  const category = String(formData.get("category") ?? "");
  const label = String(formData.get("label") ?? "").trim().slice(0, 120);
  if (!/^\d{4}-\d{2}$/.test(month) || !category || !label) return;
  const max = await db.expenseLine.aggregate({ where: { month, category }, _max: { sortOrder: true } });
  await db.expenseLine.upsert({
    where: { month_category_label: { month, category, label } },
    update: {},
    create: { month, category, label, sortOrder: (max._max.sortOrder ?? 0) + 1, actual: num(formData, "actual") },
  });
  revalidatePath("/expenses");
}

export async function deleteExpenseLine(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.expenseLine.delete({ where: { id } });
  revalidatePath("/expenses");
}

/** Start a new month by copying the prior month's line items (zeroed actuals). */
export async function startExpenseMonth(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return;
  const month = String(formData.get("month") ?? "");
  const from = String(formData.get("from") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  const existing = await db.expenseLine.count({ where: { month } });
  if (existing > 0) { revalidatePath("/expenses"); return; }
  const template = await db.expenseLine.findMany({ where: { month: from } });
  if (template.length > 0) {
    await db.expenseLine.createMany({
      data: template.map((t) => ({ month, category: t.category, label: t.label, projected: t.projected, actual: 0, sortOrder: t.sortOrder })),
      skipDuplicates: true,
    });
  }
  await db.expenseMonth.upsert({ where: { month }, update: {}, create: { month } });
  revalidatePath("/expenses");
}

// --- Monday-meeting highlights log -------------------------------------------

export async function addMeetingHighlight(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const text = String(formData.get("text") ?? "").trim().slice(0, 300);
  if (!text) return;
  const weekOf = String(formData.get("weekOf") ?? "").trim();
  await db.meetingHighlight.create({ data: { text, weekOf, addedBy: me!.name } });
  revalidatePath("/meeting");
}

export async function deleteMeetingHighlight(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.meetingHighlight.delete({ where: { id } });
  revalidatePath("/meeting");
}

// --- Daily huddle (stand-up) -------------------------------------------------

async function canEditStandup(targetUserId: string): Promise<boolean> {
  const me = await getCurrentUser();
  if (!me) return false;
  return me.id === targetUserId || isManager(me);
}

async function ensureStandup(userId: string, date: string) {
  return db.standup.upsert({ where: { userId_date: { userId, date } }, update: {}, create: { userId, date } });
}

/** Set a dispositions rep's daily focus: traditional vs developer/luxury. */
export async function setDayFocus(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const date = String(formData.get("date") ?? "");
  const focus = String(formData.get("focus")) === "developer" ? "developer" : "traditional";
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  if (!(await canEditStandup(userId))) return;
  await db.standup.upsert({ where: { userId_date: { userId, date } }, update: { focus }, create: { userId, date, focus } });
  revalidatePath("/entry");
  revalidatePath("/huddle");
}

export async function saveStandup(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  if (!(await canEditStandup(userId))) return;
  const data = {
    goal: String(formData.get("goal") ?? "").trim().slice(0, 500),
    pending: String(formData.get("pending") ?? "").trim().slice(0, 800),
    note: String(formData.get("note") ?? "").trim().slice(0, 1500),
    submitted: formData.get("submitted") === "on" || formData.get("submitted") === "1",
  };
  await db.standup.upsert({ where: { userId_date: { userId, date } }, update: data, create: { userId, date, ...data } });
  revalidatePath("/huddle");
}

export async function saveStandupEod(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  if (!(await canEditStandup(userId))) return;
  const data = {
    eodHit: ["hit", "partial", "miss", ""].includes(String(formData.get("eodHit"))) ? String(formData.get("eodHit")) : "",
    eodNote: String(formData.get("eodNote") ?? "").trim().slice(0, 800),
    eodFollowup: String(formData.get("eodFollowup") ?? "").trim().slice(0, 800),
  };
  await db.standup.upsert({ where: { userId_date: { userId, date } }, update: data, create: { userId, date, ...data } });
  revalidatePath("/huddle");
}

export async function addStandupItem(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const date = String(formData.get("date") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) return;
  if (!(await canEditStandup(userId))) return;
  const s = await ensureStandup(userId, date);
  await db.standupItem.create({
    data: {
      standupId: s.id,
      title,
      status: String(formData.get("status") ?? "").trim().slice(0, 120),
      roadblock: String(formData.get("roadblock") ?? "").trim().slice(0, 300),
      nextStep: String(formData.get("nextStep") ?? "").trim().slice(0, 300),
      todayAction: String(formData.get("todayAction") ?? "").trim().slice(0, 300),
    },
  });
  revalidatePath("/huddle");
}

export async function saveStandupItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const item = await db.standupItem.findUnique({ where: { id }, include: { standup: true } });
  if (!item || !(await canEditStandup(item.standup.userId))) return;
  await db.standupItem.update({
    where: { id },
    data: {
      status: String(formData.get("status") ?? "").trim().slice(0, 120),
      roadblock: String(formData.get("roadblock") ?? "").trim().slice(0, 300),
      nextStep: String(formData.get("nextStep") ?? "").trim().slice(0, 300),
      todayAction: String(formData.get("todayAction") ?? "").trim().slice(0, 300),
      hot: formData.get("hot") === "on" || formData.get("hot") === "1",
    },
  });
  revalidatePath("/huddle");
}

// Leader (Jon/Marie) assigns a task / note to a rep in the huddle.
export async function addHuddleTask(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const text = String(formData.get("text") ?? "").trim().slice(0, 300);
  if (!userId || !text) return;
  await db.huddleTask.create({ data: { userId, text, assignedBy: me!.name } });
  revalidatePath("/huddle");
}

export async function toggleHuddleTask(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const t = await db.huddleTask.findUnique({ where: { id } });
  if (!t) return;
  if (t.userId !== me.id && !isManager(me)) return; // rep can mark their own done; managers any
  const done = !t.done;
  await db.huddleTask.update({ where: { id }, data: { done, doneAt: done ? new Date() : null } });
  revalidatePath("/huddle");
}

export async function deleteHuddleTask(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.huddleTask.delete({ where: { id } });
  revalidatePath("/huddle");
}

export async function deleteStandupItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const item = await db.standupItem.findUnique({ where: { id }, include: { standup: true } });
  if (!item || !(await canEditStandup(item.standup.userId))) return;
  await db.standupItem.delete({ where: { id } });
  revalidatePath("/huddle");
}

// --- Training portal ----------------------------------------------------------

export async function addTrainingFocus(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const skill = String(formData.get("skill") ?? "").trim().slice(0, 120);
  if (!userId || !skill) return;
  const max = await db.trainingFocus.aggregate({ where: { userId }, _max: { priority: true } });
  await db.trainingFocus.create({ data: { userId, skill, priority: (max._max.priority ?? 0) + 1, notes: String(formData.get("notes") ?? "").trim().slice(0, 300) } });
  revalidatePath("/training");
}

export async function updateTrainingFocus(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const data: { status?: string; notes?: string } = {};
  const status = String(formData.get("status") ?? "");
  if (status) data.status = status;
  if (formData.has("notes")) data.notes = String(formData.get("notes") ?? "").trim().slice(0, 300);
  await db.trainingFocus.update({ where: { id }, data });
  revalidatePath("/training");
}

export async function deleteTrainingFocus(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) { await db.trainingFocus.delete({ where: { id } }); revalidatePath("/training"); }
}

export async function addTrainingSchedule(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const focus = String(formData.get("focus") ?? "").trim().slice(0, 200);
  if (!userId || !focus) return;
  await db.trainingSchedule.create({ data: { userId, focus, cadence: String(formData.get("cadence") || "weekly"), time: String(formData.get("time") ?? "").trim().slice(0, 40) } });
  revalidatePath("/training");
}

export async function deleteTrainingSchedule(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) { await db.trainingSchedule.delete({ where: { id } }); revalidatePath("/training"); }
}

export async function logCoachingSession(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1500);
  const date = String(formData.get("date") ?? "");
  if (!userId || !notes || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const ratingRaw = parseInt(String(formData.get("rating") ?? ""), 10);
  await db.coachingSession.create({ data: {
    userId, coach: me!.name, date,
    type: String(formData.get("type") || "call_review"),
    skill: String(formData.get("skill") ?? "").trim().slice(0, 120),
    notes, nextStep: String(formData.get("nextStep") ?? "").trim().slice(0, 500),
    rating: Number.isFinite(ratingRaw) ? ratingRaw : null,
  } });
  revalidatePath("/training");
}

export async function deleteCoachingSession(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) { await db.coachingSession.delete({ where: { id } }); revalidatePath("/training"); }
}

// --- Huddle checklists (goals for today / pending from yesterday) -------------

export async function addHuddleCheck(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const date = String(formData.get("date") ?? "");
  const kind = String(formData.get("kind")) === "pending" ? "pending" : "goal";
  const text = String(formData.get("text") ?? "").trim().slice(0, 300);
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !text) return;
  if (!(await canEditStandup(userId))) return;
  const max = await db.huddleCheck.aggregate({ where: { userId, date, kind }, _max: { sortOrder: true } });
  await db.huddleCheck.create({ data: { userId, date, kind, text, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  revalidatePath("/huddle");
}

export async function toggleHuddleCheck(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const c = await db.huddleCheck.findUnique({ where: { id } });
  if (!c) return;
  if (c.userId !== me.id && !isManager(me)) return;
  const done = !c.done;
  await db.huddleCheck.update({ where: { id }, data: { done, doneAt: done ? new Date() : null } });
  revalidatePath("/huddle");
}

export async function deleteHuddleCheck(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const c = await db.huddleCheck.findUnique({ where: { id } });
  if (!c || !(await canEditStandup(c.userId))) return;
  await db.huddleCheck.delete({ where: { id } });
  revalidatePath("/huddle");
}

/** Save this month's marketing inputs (per-channel spend + email rates) for the Benchmarks page. */
export async function saveBenchmarkInputs(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return;
  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  const date = `${month}-01`;
  const keys = ["spend_ppl", "spend_sms", "spend_mail", "email_open_rate", "email_ctr"];
  const kpis = await db.kpi.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
  const idByKey = new Map(kpis.map((k) => [k.key, k.id]));
  for (const key of keys) {
    const raw = formData.get(key);
    const kpiId = idByKey.get(key);
    if (!kpiId) continue;
    const str = raw == null ? "" : String(raw).trim();
    const existing = await db.entry.findFirst({ where: { kpiId, userId: null, date } });
    if (str === "") {
      if (existing) await db.entry.delete({ where: { id: existing.id } });
      continue;
    }
    const value = parseFloat(str) || 0;
    if (existing) await db.entry.update({ where: { id: existing.id }, data: { value } });
    else await db.entry.create({ data: { kpiId, userId: null, date, value, enteredBy: me.name } });
  }
  revalidatePath("/benchmarks");
}

/** Save biweekly payroll settings (anchor payday + recipients). Owner only. */
export async function savePayrollSettings(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return;
  const data = {
    payCycleAnchor: String(formData.get("payCycleAnchor") ?? "").trim(),
    payrollEmails: String(formData.get("payrollEmails") ?? "").trim(),
  };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/admin");
  revalidatePath("/timecard");
  redirect("/admin?saved=Payroll");
}

// --- Availability (part-time / irregular members like Ethan) ----------------

export async function addAvailability(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const date = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const fmt = (t: string) => {
    if (!/^\d{2}:\d{2}$/.test(t)) return "";
    let [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${ap}`;
  };
  const from = fmt(String(formData.get("from") ?? "").trim());
  const to = fmt(String(formData.get("to") ?? "").trim());
  const raw = String(formData.get("hours") ?? "").trim();
  const hours = (from && to ? `${from} – ${to}` : from ? `from ${from}` : raw).slice(0, 60);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  await db.availability.create({ data: { userId: me.id, date, hours, note } });
  revalidatePath("/schedule");
}

export async function deleteAvailability(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const row = await db.availability.findUnique({ where: { id } });
  if (!row) return;
  if (row.userId !== me.id && !isManager(me)) return;
  await db.availability.delete({ where: { id } });
  revalidatePath("/schedule");
}

// ===== Culture: birthdays, work anniversaries, team-building events =====

/** Manager sets a person's birthday (MM-DD) + hire date (YYYY-MM-DD). */
export async function saveCultureDates(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const bRaw = String(formData.get("birthday") ?? "").trim();
  // Accept "YYYY-MM-DD" or "MM-DD"; store as MM-DD (year doesn't matter for birthdays).
  const birthday = bRaw ? (bRaw.length >= 10 ? bRaw.slice(5, 10) : bRaw.slice(0, 5)) : null;
  const hireRaw = String(formData.get("hireDate") ?? "").trim();
  const hireDate = /^\d{4}-\d{2}-\d{2}$/.test(hireRaw) ? hireRaw : null;
  await db.user.update({ where: { id }, data: { birthday, hireDate } });
  revalidatePath("/culture");
}

/** Add a team-building event / celebration. */
export async function addTeamEvent(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const date = String(formData.get("date") ?? "").trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const kind = String(formData.get("kind") ?? "team_building");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);
  await db.teamEvent.create({ data: { title, date, kind, notes, createdById: me!.id } });
  revalidatePath("/culture");
}

export async function deleteTeamEvent(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.teamEvent.delete({ where: { id } });
  revalidatePath("/culture");
}

/** Bulk-import buyers/developers using an EXPLICIT column map the user chose in the UI
 *  (CSV column index per field), so messy/varied CSVs map cleanly. */
export async function importMarketContactsMapped(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const text = String(formData.get("csv") ?? "");
  let map: Record<string, number> = {};
  try { map = JSON.parse(String(formData.get("map") ?? "{}")); } catch { map = {}; }
  if (!text.trim()) redirect("/vetting?imp=empty");
  const rows = parseCsvRows(text);
  if (rows.length < 2) redirect("/vetting?imp=empty");
  if (map.name == null || map.name < 0) redirect("/vetting?imp=noname");

  const settings = await getSettings();
  const today = orgToday(settings.orgTimezone);
  const g = (row: string[], k: string) => { const i = map[k]; return i != null && i >= 0 && i < row.length ? String(row[i] ?? "").trim() : ""; };

  let n = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = g(row, "name");
    if (!name) continue;
    await db.marketContact.create({ data: {
      name,
      company: g(row, "company"),
      category: g(row, "category").toLowerCase() === "luxury" ? "luxury" : "distressed",
      type: g(row, "type"),
      region: g(row, "region"), market: g(row, "market"),
      status: g(row, "status"),
      email: g(row, "email"), phone: g(row, "phone"), phone2: g(row, "phone2"),
      website: g(row, "website"), links: g(row, "links"),
      buyBox: g(row, "buyBox"), buyBoxAreas: g(row, "buyBoxAreas"),
      priceRange: g(row, "priceRange"), dealType: g(row, "dealType"), buildType: g(row, "buildType"), minLotSize: g(row, "minLotSize"),
      propertyType: g(row, "propertyType"), igHandle: g(row, "igHandle"), bestContact: g(row, "bestContact"),
      title: g(row, "title"), decisionMaker: g(row, "decisionMaker"), buyingFrequency: g(row, "buyingFrequency"), closingSpeed: g(row, "closingSpeed"),
      notes: g(row, "notes"), outreachLog: g(row, "outreachLog"), vetArea: g(row, "vetArea"),
      vetStage: "to_vet", vetStatus: "to_contact",
      addedById: me!.id, addedOn: today,
    } });
    n++;
  }
  await rollupResearchKpis(me!.id, today); // credits New Buyers Added for dispo reps
  revalidatePath("/vetting");
  revalidatePath("/marketing");
  redirect(`/vetting?imp=${n}`);
}

/** Mark a scored call as reviewed for training: a 1–5 star rating and/or a
 *  "used for training" flag. Managers + the person who scored it can set these. */
export async function reviewCallScore(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const score = await db.callScore.findUnique({ where: { id }, select: { scoredBy: true, usedForTraining: true } });
  if (!score) return;
  if (!isManager(me) && me.name !== score.scoredBy) return;
  const data: { reviewStars?: number; usedForTraining?: boolean } = {};
  const starsRaw = formData.get("stars");
  if (starsRaw != null) data.reviewStars = Math.max(0, Math.min(5, Number(starsRaw) || 0));
  if (formData.get("training") != null) data.usedForTraining = !score.usedForTraining;
  await db.callScore.update({ where: { id }, data });
  revalidatePath("/call-scoring");
}

// ===== Behavioral assessment (Onboarding) — owner-only results =====

/** Create an assessment invite + shareable no-login link. Owner only. */
export async function createAssessmentInvite(formData: FormData) {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const email = String(formData.get("email") ?? "").trim();
  const userId = String(formData.get("userId") ?? "").trim() || null;
  await db.assessment.create({
    data: { token: randomUUID().replace(/-/g, "").slice(0, 20), name, email, userId, createdBy: me?.name ?? "" },
  });
  revalidatePath("/onboarding");
  redirect("/onboarding#assessments");
}

/** Delete an assessment invite/result. Owner only. */
export async function deleteAssessment(formData: FormData) {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  const id = String(formData.get("id") ?? "");
  if (id) await db.assessment.delete({ where: { id } }).catch(() => {});
  revalidatePath("/onboarding");
}

/** Move a user into or out of the onboarding ramp (restricted nav). Owner only.
 *  onboarding=true → they see only learning + basics; false = certified, full access. */
export async function setUserOnboarding(formData: FormData) {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const on = String(formData.get("onboarding") ?? "") === "1";
  if (userId) await db.user.update({ where: { id: userId }, data: { onboarding: on } }).catch(() => {});
  revalidatePath("/onboarding");
}

/** Submit a completed instrument. PUBLIC — the unguessable token is the key (no login),
 *  so a candidate can complete it before they're in the system. Scored server-side. */
export async function submitAssessment(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const instrument = String(formData.get("instrument") ?? ""); // "work_styles" | "word_survey"
  if (!token || !instrument) return;
  const row = await db.assessment.findUnique({ where: { token } });
  if (!row) return;

  const parse = (k: string): string[] => { try { const v = JSON.parse(String(formData.get(k) ?? "[]")); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
  const data: Record<string, unknown> = {};
  let profileKey = row.profileKey;

  if (instrument === "work_styles") {
    const { scoreWorkStyles, profileFor } = await import("@/lib/assessment");
    const { disc, self } = scoreWorkStyles(parse("natural"), parse("expected"));
    const profile = profileFor(disc);
    data.workStylesResult = JSON.stringify({ disc, self, profile: profile.key });
    profileKey = profile.key;
  } else if (instrument === "word_survey") {
    const { scoreWordSurvey, profileFor } = await import("@/lib/assessment");
    const disc = scoreWordSurvey(parse("most"), parse("least"));
    const profile = profileFor(disc);
    data.wordSurveyResult = JSON.stringify({ disc, profile: profile.key });
    if (!profileKey) profileKey = profile.key; // Work Styles headline wins if both done
  } else return;

  data.profileKey = profileKey;
  data.completedAt = new Date();
  await db.assessment.update({ where: { token }, data });
  revalidatePath(`/assess/${token}`);
  redirect(`/assess/${token}?done=${instrument}`);
}
