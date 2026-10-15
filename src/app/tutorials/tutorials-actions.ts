"use server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { readTutorials, writeTutorials, type Tutorial } from "@/lib/tutorials";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function addTutorialAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const title = String(formData.get("title") ?? "").trim();
  const section = String(formData.get("section") ?? "General / Systems").trim();
  const url = String(formData.get("url") ?? "").trim();
  if (!title || !/^https?:\/\//i.test(url)) redirect("/tutorials?err=1");
  const list = await readTutorials();
  list.unshift({ id: `v_${Math.random().toString(36).slice(2, 9)}`, title: title.slice(0, 120), section, url: url.slice(0, 500), addedBy: me!.name, addedAt: new Date().toISOString().slice(0, 10) });
  await writeTutorials(list);
  revalidatePath("/tutorials");
  redirect("/tutorials?added=1");
}

export async function removeTutorialAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const id = String(formData.get("id") ?? "");
  const list = (await readTutorials()).filter((t: Tutorial) => t.id !== id);
  await writeTutorials(list);
  revalidatePath("/tutorials");
}
