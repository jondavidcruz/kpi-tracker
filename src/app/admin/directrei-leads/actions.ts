"use server";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { setDreiLeads, pullDreiQualifiedLeads } from "@/lib/directrei-leads";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

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
