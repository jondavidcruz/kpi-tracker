import { SectionTitle } from "@/components/ui";
import { readClosingActuals } from "@/app/actions";
import { actualClosingTotal } from "@/lib/closing-actuals";
import UnderwritingCalculator from "@/components/UnderwritingCalculator";
import UnderwriteBot from "@/components/UnderwriteBot";

export const dynamic = "force-dynamic";

export default async function UnderwritingPage() {
  // Closing-cost estimate for the land calc: the average of our ACTUAL logged
  // closings (Closing Calculator), rounded to $50 — falls back to $1,500.
  const totals = (await readClosingActuals()).map(actualClosingTotal).filter((t) => t > 0);
  const defaultCloseCost = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length / 50) * 50 : 1500;
  return (
    <div className="space-y-5">
      <SectionTitle
        title="🧮 Underwriting Calculator"
        subtitle="Analyze a deal five ways — Assignment, Novation, Creative, Listing, or Flip — with market-tier pricing, ARV-tiered fees, ROI, and a color PDF for offer calls."
        accent="bg-brand-gold"
      />
      <UnderwritingCalculator defaultCloseCost={defaultCloseCost} closeCostN={totals.length} />

      <UnderwriteBot />
    </div>
  );
}
