import { SectionTitle } from "@/components/ui";
import ProcessMap from "@/components/ProcessMap";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Onboarding hires only see the steps for their own lane — an acquisitions hire never
// sees the dispositions/escrow side, and vice-versa. Trusted team sees the whole map.
const ROLE_DEPTS: Record<string, string[]> = {
  acquisitions: ["Marketing", "Acquisitions", "Underwriting"],
  cc_lm: ["Marketing", "Acquisitions"],
  dispositions: ["Dispositions", "Escrow", "Closing", "Listings"],
};

export default async function ProcessPage() {
  const me = await getCurrentUser();
  const allowedDepts = me?.onboarding ? (ROLE_DEPTS[me.position ?? ""] ?? ROLE_DEPTS.acquisitions) : null;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗺️ Deal Flow — Process Map"
        subtitle={allowedDepts
          ? "Your part of the deal flow, step by step. You'll see the rest of the pipeline once you're fully ramped."
          : "Pick the right workflow for the deal — standard close, rejected→listing, cash-for-keys, pre-foreclosure, probate, or other issues. Each is a step-by-step checklist."}
        accent="bg-brand-gold"
      />
      <ProcessMap allowedDepts={allowedDepts} />
    </div>
  );
}
