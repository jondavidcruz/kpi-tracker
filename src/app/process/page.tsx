import { SectionTitle } from "@/components/ui";
import ProcessMap from "@/components/ProcessMap";

export const dynamic = "force-dynamic";

export default function ProcessPage() {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗺️ Deal Flow — Process Map"
        subtitle="Pick the right workflow for the deal — standard close, rejected→listing, cash-for-keys, pre-foreclosure, probate, or other issues. Each is a step-by-step checklist."
        accent="bg-brand-gold"
      />
      <ProcessMap />
    </div>
  );
}
