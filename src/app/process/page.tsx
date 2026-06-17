import { SectionTitle } from "@/components/ui";
import ProcessMap from "@/components/ProcessMap";

export const dynamic = "force-dynamic";

export default function ProcessPage() {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗺️ Deal Flow — Process Map"
        subtitle="Every phase from a fresh lead to recorded close. Click any phase to see the steps, who owns it, and where AI helps or takes over."
        accent="bg-brand-gold"
      />
      <ProcessMap />
    </div>
  );
}
