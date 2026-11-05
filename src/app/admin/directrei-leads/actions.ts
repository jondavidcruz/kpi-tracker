"use server";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { setDreiLeads } from "@/lib/directrei-leads";
import { revalidatePath } from "next/cache";

export async function toggleDreiLeadsAction(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  await setDreiLeads(String(formData.get("on") ?? "") === "1");
  revalidatePath("/admin/directrei-leads");
}
