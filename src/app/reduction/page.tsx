import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import ReductionCoach from "@/components/ReductionCoach";

export const dynamic = "force-dynamic";

// 🔻 The Reduction Play (Jon 2026-10-09): a dummy-proof coach for getting a
// price reduction from OUR seller — calculator + the exact script, built
// from the real reasons (buyer walk-throughs, repairs quoted, DOM, market).
export default async function ReductionPage({ searchParams }: { searchParams: Promise<{ address?: string; contract?: string }> }) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "dispositions", "cc_lm"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">Team only.</Card>;
  const sp = await searchParams;
  // 🧮 sync with the underwriting calculator by address (Jon 2026-10-09)
  let uw: Array<{ tab: string; mao: number; fee: number }> = [];
  if (sp.address) {
    try {
      const { readUnderwrites } = await import("@/app/actions");
      const { addrMatch } = await import("@/lib/underwrite-history");
      const seen = new Set<string>();
      uw = (await readUnderwrites()).filter((u) => u.address && addrMatch(u.address, sp.address!)).filter((u) => !seen.has(u.tab) && seen.add(u.tab)).slice(0, 5).map((u) => ({ tab: u.tab, mao: u.mao, fee: u.fee }));
    } catch { /* coach works without it */ }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle title="🔻 The Reduction Play" subtitle="Never done a reduction call? Fill in the real numbers below — it writes your exact script. THE RULE: minimum 3 offers in hand before we reduce or accept anything." accent="bg-rose-400" />
      <ReductionCoach initial={{ address: sp.address ?? "", contractPrice: sp.contract ?? "" }} uw={uw} />
    </div>
  );
}
