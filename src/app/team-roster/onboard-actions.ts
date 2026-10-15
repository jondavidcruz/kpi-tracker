"use server";
// 🧑‍💼 One-step onboarding from the roster (Jon 2026-10-15): add a team member →
// creates their War Room account in LOCKED onboarding mode + their roster card in
// one action, and a per-hire "Send welcome email" that emails their logins, systems,
// and pay/bonus schedule. Collapses the old roster + Admin→Team + Onboarding dance.
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { defaultNewRepNavHidden } from "@/lib/navItems";
import { buildWelcomeEmail } from "@/lib/welcome-email";
import { sendEmailTo, sendEmailWithAttachment } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function addTeamMemberAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return;
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = ["rep", "manager", "admin"].includes(String(formData.get("role"))) ? String(formData.get("role")) : "rep";
  const position = ["acquisitions", "dispositions", "cc_lm"].includes(String(formData.get("position"))) ? String(formData.get("position")) : "";
  if (!name || !email) redirect("/team-roster?adderr=1");
  // Create the account LOCKED to newbie basics (onboarding) with the restricted
  // new-rep nav template. A User row with their email is enough to magic-link in.
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data: { name, role, position, active: true, onboarding: true } })
    : await db.user.create({ data: { name, email, role, position, active: true, onboarding: true, navHidden: defaultNewRepNavHidden(), accessMarketing: false } });
  // Create their roster/HR card linked to the account (if not already there).
  const prof = await db.teamProfile.findUnique({ where: { userId: user.id }, select: { id: true } }).catch(() => null);
  if (!prof) await db.teamProfile.create({ data: { userId: user.id, name } }).catch(() => {});
  revalidatePath("/team-roster");
  revalidatePath("/admin");
  redirect(`/team-roster?added=${encodeURIComponent(name)}`);
}

export async function sendWelcomeEmailAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return;
  const userId = String(formData.get("userId") ?? "");
  const u = userId ? await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, position: true } }) : null;
  if (!u?.email) redirect("/team-roster?welcomeerr=noemail");
  const { subject, html } = await buildWelcomeEmail({ name: u.name, position: u.position ?? "", email: u.email });
  // Auto-attach their most recent signed agreement (TeamDoc) if one is uploaded,
  // so Jon doesn't have to attach it by hand (Jon 2026-10-15).
  let attachment: { filename: string; content: string } | null = null;
  try {
    const doc = await db.teamDoc.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true, filename: true, data: true } });
    if (doc) {
      let bytes: Uint8Array | null = doc.data && doc.data.length > 0 ? new Uint8Array(doc.data) : null;
      if (!bytes) {
        const { getDriveFile } = await import("@/lib/drive-store");
        const { downloadFromDrive } = await import("@/lib/gdrive");
        const driveId = await getDriveFile(`doc:${doc.id}`).catch(() => null);
        if (driveId) bytes = await downloadFromDrive(driveId);
      }
      if (bytes && bytes.length > 0 && bytes.length < 14 * 1024 * 1024) attachment = { filename: doc.filename || "signed-agreement.pdf", content: Buffer.from(bytes).toString("base64") };
    }
  } catch { /* attachment best-effort */ }
  const err: { msg?: string } = {};
  const ok = attachment
    ? await sendEmailWithAttachment([u.email], subject, html, attachment)
    : await sendEmailTo([u.email], subject, html, undefined, undefined, err);
  revalidatePath("/team-roster");
  redirect(ok ? `/team-roster?welcomed=${encodeURIComponent(u.name)}` : `/team-roster?welcomeerr=${encodeURIComponent(err.msg || "send failed")}`);
}
