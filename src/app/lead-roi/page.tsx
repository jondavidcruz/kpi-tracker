import { SectionTitle } from "@/components/ui";
import LeadRoiCalculator from "@/components/LeadRoiCalculator";

export const dynamic = "force-dynamic";

export default function LeadRoiPage() {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="📈 Lead ROI Calculator"
        subtitle="Is a lead channel worth the money? Spend → leads → contacts → offers → contracts → closings, with the cost of every stage and the ROI verdict. Start from a channel preset, then plug in our real numbers."
        accent="bg-brand-gold"
      />
      <LeadRoiCalculator />
      <p className="text-[11px] text-slate-400">
        Tip: real per-channel spend lives in the P&amp;L (Expenses) and lead counts on the scorecard — use last month&apos;s actuals here for a true read, not the preset defaults.
      </p>
    </div>
  );
}
