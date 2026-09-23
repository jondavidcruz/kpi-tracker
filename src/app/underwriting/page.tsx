import { SectionTitle } from "@/components/ui";
import UnderwritingCalculator from "@/components/UnderwritingCalculator";
import UnderwriteBot from "@/components/UnderwriteBot";
import LandTools from "@/components/LandTools";

export const dynamic = "force-dynamic";

export default function UnderwritingPage() {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="🧮 Underwriting Calculator"
        subtitle="Analyze a deal five ways — Assignment, Novation, Creative, Listing, or Flip — with market-tier pricing, ARV-tiered fees, ROI, and a color PDF for offer calls."
        accent="bg-brand-gold"
      />
      <UnderwritingCalculator />

      <SectionTitle
        title="🌱 Land Calculators"
        subtitle="Run the numbers before you make the offer. Nothing here is saved — it's a scratchpad. Land OFFERS are made in the calculator above — Cash (Land), Developer, or Novation."
        accent="bg-emerald-500"
      />
      <LandTools />

      <UnderwriteBot />
    </div>
  );
}
