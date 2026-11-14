"use server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { addManualLegalWatch, optOutLegalWatchContact, scanHistoryForThreats } from "@/lib/legal-watch";
import { revalidatePath } from "next/cache";

// ⚖️ Log a litigation threat made on a CALL / in person (no inbound text to auto-catch it) — Jon
// 2026-11-13: "save the info of people who said they're going to sue us." Manager-gated.
export async function logManualThreat(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const name = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!name || !note) return;
  await addManualLegalWatch({
    contactId: String(formData.get("contactId") ?? "").trim() || undefined,
    name,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim() || undefined,
    note,
    by: me!.name,
    optOut: formData.get("optOut") === "on",
  });
  revalidatePath("/legal-watch");
}

// 🚫 One-click "opt them out now" from the Litigator Protocol page.
export async function optOutNow(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const contactId = String(formData.get("contactId") ?? "").trim();
  if (!contactId) return;
  await optOutLegalWatchContact(contactId, me!.name);
  revalidatePath("/legal-watch");
}

// 🔎 Backfill the defense file from CRM history — catches people who threatened to sue us before
// this system existed. Record-only (no auto-opt-out); a manager reviews each.
export async function scanHistory(): Promise<void> {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  await scanHistoryForThreats();
  revalidatePath("/legal-watch");
}
