"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { fromInput, type Unit } from "@/lib/format";
import { dispatchHardAlerts, evaluateAndRecordAlerts } from "@/lib/alerts";
import { buildPipDraft } from "@/lib/pip";
import { getChannelConfig, sendEmail } from "@/lib/notify";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { isExcusedReason } from "@/lib/alert-resolution";

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
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const severity = String(formData.get("severity") ?? "normal").trim();
  if (!title) return;

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
  };
  await db.settings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  revalidatePath("/admin");
  redirect("/admin?saved=Settings");
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
