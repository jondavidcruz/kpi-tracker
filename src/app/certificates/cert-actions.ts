"use server";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { readCerts, awardCert, removeCert, certHtml } from "@/lib/certs";
import { sendEmailTo } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function awardCertAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const detail = String(formData.get("detail") ?? "").trim();
  if (!userId || !title) redirect("/certificates?err=1");
  await awardCert(userId, title, detail, "custom");
  revalidatePath("/certificates");
  redirect("/certificates?awarded=1");
}

export async function removeCertAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const id = String(formData.get("id") ?? "");
  if (userId && id) await removeCert(userId, id);
  revalidatePath("/certificates");
}

export async function sendCertAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const u = userId ? await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }) : null;
  if (!u?.email) redirect("/certificates?senterr=noemail");
  const certs = (await readCerts())[userId] ?? [];
  if (!certs.length) redirect("/certificates?senterr=nocerts");
  const body = certs.map((c) => certHtml(u.name, c.title, c.detail, c.issuedOn)).join('<div style="height:18px"></div>');
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:20px"><div style="max-width:640px;margin:0 auto"><p style="font-family:-apple-system,Arial,sans-serif;color:#334155">Congratulations, ${u.name.split(" ")[0]} — here ${certs.length === 1 ? "is your certificate" : `are your ${certs.length} certificates`} from Freedom Offers. 🎖</p>${body}</div></body></html>`;
  const ok = await sendEmailTo([u.email], `🎖 Your Freedom Offers certificate${certs.length > 1 ? "s" : ""}`, html);
  revalidatePath("/certificates");
  redirect(ok ? `/certificates?sent=${encodeURIComponent(u.name)}` : "/certificates?senterr=1");
}
