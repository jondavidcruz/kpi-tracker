"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { fromInput, type Unit } from "@/lib/format";
import { dispatchHardAlerts, evaluateAndRecordAlerts } from "@/lib/alerts";
import { createClient } from "@/lib/supabase/server";

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

  // Instant on-entry alerting for the KPIs that changed. Hard (money) misses
  // go out to Google Chat + email immediately; soft ones wait for the digest.
  const created = await evaluateAndRecordAlerts(date, [...touchedKpiIds]);
  await dispatchHardAlerts(created);

  revalidatePath("/dashboard");
  revalidatePath("/entry");
  revalidatePath("/alerts");
  revalidatePath("/monthly");
}

export async function setAlertStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["open", "ack", "resolved"].includes(status)) return;
  await db.alert.update({ where: { id }, data: { status } });
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
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
  if (!name || !email) return;
  const data = { name, email, role, position, note, active };
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
  const data = {
    address,
    status: String(formData.get("status") ?? "under_contract"),
    assignedTo: String(formData.get("assignedTo") ?? "").trim(),
    buyerName: String(formData.get("buyerName") ?? "").trim(),
    contractPrice: numOrNull(formData.get("contractPrice")),
    askingPrice: numOrNull(formData.get("askingPrice")),
    soldPrice: numOrNull(formData.get("soldPrice")),
    assignmentFee: numOrNull(formData.get("assignmentFee")),
    contractDate: String(formData.get("contractDate") ?? "").trim(),
    soldDate: String(formData.get("soldDate") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
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
