import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import ReductionCoach from "@/components/ReductionCoach";

export const dynamic = "force-dynamic";

// 🔻 The Reduction Play (Jon 2026-10-09): a dummy-proof coach for getting a
// price reduction from OUR seller — calculator + the exact script, built
// from the real reasons (buyer walk-throughs, repairs quoted, DOM, market).
export default async function ReductionPage() {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "dispositions", "cc_lm"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">Team only.</Card>;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle title="🔻 The Reduction Play" subtitle="Never done a reduction call? Fill in the real numbers below — it writes your exact script. THE RULE: minimum 3 offers in hand before we reduce or accept anything." accent="bg-rose-400" />
      <ReductionCoach />
    </div>
  );
}
