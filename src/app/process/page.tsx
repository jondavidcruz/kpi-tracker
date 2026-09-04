import { SectionTitle } from "@/components/ui";
import ProcessMap from "@/components/ProcessMap";
import { getCurrentUser, isManager, isCSuitePerson, canAccessMarketing } from "@/lib/auth";
import { secondaryPositionOf } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Reps only see THEIR lane of the pipeline (Jon 2026-08-26: an acquisitions rep
// like Nick or Austin gets the Acquisitions steps, not the whole map). Managers
// + the trusted three see everything. Hybrids get both of their lanes; the
// Markets & Buyers flag adds the Marketing (lead-gen) lane.
const ROLE_DEPTS: Record<string, string[]> = {
  acquisitions: ["Acquisitions", "Underwriting"],
  cc_lm: ["Marketing", "Acquisitions"],
  dispositions: ["Dispositions", "Escrow", "Closing", "Listings"],
};

export default async function ProcessPage() {
  const me = await getCurrentUser();
  const fullView = !me || isManager(me) || isCSuitePerson(me);
  let allowedDepts: string[] | null = null;
  if (!fullView && me) {
    const base = ROLE_DEPTS[me.position ?? ""] ?? ROLE_DEPTS.acquisitions;
    const sec = secondaryPositionOf(me);
    const extra = sec ? ROLE_DEPTS[sec] ?? [] : [];
    const mkt = canAccessMarketing(me) ? ["Marketing"] : [];
    allowedDepts = [...new Set([...base, ...extra, ...mkt])];
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗺️ Deal Flow — Process Map"
        subtitle={allowedDepts
          ? "Your lane of the deal flow, step by step — this is your SOP. Managers see the whole pipeline."
          : "Pick the right workflow for the deal — standard close, rejected→listing, cash-for-keys, pre-foreclosure, probate, or other issues. Each is a step-by-step checklist."}
        accent="bg-brand-gold"
      />
      <ProcessMap allowedDepts={allowedDepts} />
    </div>
  );
}
