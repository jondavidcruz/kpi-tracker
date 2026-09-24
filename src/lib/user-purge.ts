// Complete erasure of a former team member — "like they were never there"
// (Jon 2026-09-27). Deletes every row keyed to the user across the whole schema,
// then the User row itself, and bans their Supabase login. Used by the admin
// Delete-permanently button (type-to-confirm) and the secret eraseuser op.
// NOTE: buyer data (MarketContact etc.) is NEVER touched — attribution ids there
// simply stop resolving, and rule zero forbids buyer deletes anyway.
import { db } from "@/lib/db";
import { adminConfigured, createAdminClient, findAuthUserByEmail } from "@/lib/supabase/admin";

export async function purgeUser(id: string): Promise<{ ok: boolean; name?: string; error?: string }> {
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return { ok: false, error: "user not found" };

  // Children with cascade (Punch, TimeOff…) go with the user row; everything
  // else is removed explicitly so no orphan ever renders in a UI again.
  const jobs: Promise<unknown>[] = [
    db.entry.deleteMany({ where: { userId: id } }),
    db.target.deleteMany({ where: { userId: id } }),
    db.alert.deleteMany({ where: { userId: id } }),
    db.pip.deleteMany({ where: { userId: id } }),
    db.ticket.deleteMany({ where: { userId: id } }),
    db.timeOff.deleteMany({ where: { userId: id } }),
    db.punch.deleteMany({ where: { userId: id } }),
    db.standup.deleteMany({ where: { userId: id } }),
    db.availability.deleteMany({ where: { userId: id } }),
    db.outage.deleteMany({ where: { userId: id } }),
    db.bonus.deleteMany({ where: { userId: id } }),
    db.payEntry.deleteMany({ where: { userId: id } }),
    db.timeAdjustment.deleteMany({ where: { userId: id } }),
    db.assistantLog.deleteMany({ where: { userId: id } }),
    db.crmActivity.deleteMany({ where: { userId: id } }),
    db.teamProfile.deleteMany({ where: { userId: id } }),
    db.teamDoc.deleteMany({ where: { userId: id } }),
    db.reward.deleteMany({ where: { userId: id } }),
    db.rewardWish.deleteMany({ where: { userId: id } }),
    db.trainingFocus.deleteMany({ where: { userId: id } }),
    db.trainingSchedule.deleteMany({ where: { userId: id } }),
    db.coachingSession.deleteMany({ where: { userId: id } }),
    db.assessment.deleteMany({ where: { userId: id } }),
    db.huddleCheck.deleteMany({ where: { userId: id } }),
    db.huddleTask.deleteMany({ where: { userId: id } }),
    db.offboarding.deleteMany({ where: { userId: id } }),
    db.peerAssessment.deleteMany({ where: { OR: [{ raterId: id }, { subjectId: id }] } }),
  ];
  for (const j of jobs) await j.catch(() => {}); // a missing/renamed table never blocks the erase

  await db.user.delete({ where: { id } });

  // Ban the Supabase login so a saved password can't come back (best-effort).
  if (adminConfigured() && u.email) {
    try {
      const authId = await findAuthUserByEmail(u.email);
      if (authId) await createAdminClient().auth.admin.updateUserById(authId, { ban_duration: "876000h" });
    } catch { /* auth cleanup is best-effort */ }
  }
  return { ok: true, name: u.name };
}
