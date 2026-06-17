import { SectionTitle } from "@/components/ui";
import UnderwritingCalculator from "@/components/UnderwritingCalculator";

export const dynamic = "force-dynamic";

export default function UnderwritingPage() {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="🧮 Underwriting Calculator"
        subtitle="Analyze a deal three ways — Assignment, Novation, or Creative — and see your offer and spread instantly."
        accent="bg-brand-gold"
      />
      <UnderwritingCalculator />
    </div>
  );
}
