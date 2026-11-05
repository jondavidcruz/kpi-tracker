"use server";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { setDreiLeads, pullDreiQualifiedLeads, resetDreiPulledLeads, importDreiSellersCsv } from "@/lib/directrei-leads";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

/** 🧹 Archive every auto-pulled Direct REI lead so the owner can reset + re-pull clean. */
export async function resetDreiNowAction(): Promise<void> {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  const r = await resetDreiPulledLeads();
  redirect(`/admin/directrei-leads?pull=${encodeURIComponent(`archived ${r.archived} auto-pulled leads — now click Pull to bring back qualified-only`)}`);
}

/** 📥 Import an uploaded Direct REI sellers CSV — price-stated sellers with an address, not
 *  already in the War Room. The reliable path (the CSV has the notes the API doesn't). */
export async function importDreiCsvAction(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) { redirect(`/admin/directrei-leads?pull=${encodeURIComponent("err:no file selected")}`); }
  const text = await (file as File).text();
  const r = await importDreiSellersCsv(text);
  redirect(`/admin/directrei-leads?pull=${encodeURIComponent(`imported ${r.imported} interested sellers (replied/qualified) · ${r.duplicates} already in War Room · ${r.notReplied} not interested / no reply yet · ${r.noAddress} missing an address (of ${r.total})`)}`);
}

/** 🔬 Probe the Direct REI API endpoints and stash the result so the page can show us which
 *  endpoint holds the seller list + its exact shape (the pull returned 0). */
export async function diagnoseDreiAction(): Promise<void> {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  const { directReiProbe } = await import("@/lib/directrei");
  const probe = await directReiProbe();
  const row = await db.resource.findFirst({ where: { category: "__drei_probe__" } }).catch(() => null);
  const description = JSON.stringify({ at: new Date().toISOString(), probe });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "drei-probe", category: "__drei_probe__", url: "", description } });
  redirect("/admin/directrei-leads?diag=1");
}

export async function toggleDreiLeadsAction(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  await setDreiLeads(String(formData.get("on") ?? "") === "1");
  revalidatePath("/admin/directrei-leads");
}

/** Owner clicks "Pull existing qualified now" — sweeps all currently-qualified Direct REI
 *  contacts into the War Room immediately (the backfill the webhook can't do). */
export async function pullDreiNowAction(): Promise<void> {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  const r = await pullDreiQualifiedLeads();
  const msg = r.error ? `err:${r.error}` : `pulled ${r.created} new of ${r.qualified} qualified (${r.scanned} scanned)`;
  revalidatePath("/admin/directrei-leads");
  redirect(`/admin/directrei-leads?pull=${encodeURIComponent(msg)}`);
}
