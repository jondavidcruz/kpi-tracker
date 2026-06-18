import { SectionTitle } from "@/components/ui";
import UnderwritingCalculator from "@/components/UnderwritingCalculator";
import UnderwriteBot from "@/components/UnderwriteBot";

export const dynamic = "force-dynamic";

export default function UnderwritingPage() {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="🧮 Underwriting Calculator"
        subtitle="Analyze a deal four ways — Assignment, Novation, Creative, or Listing — with market-tier pricing, flipper holding, comps, and PDF export."
        accent="bg-brand-gold"
      />
      <UnderwritingCalculator />
      <UnderwriteBot />
    </div>
  );
}
