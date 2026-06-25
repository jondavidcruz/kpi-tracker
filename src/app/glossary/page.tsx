import { Card, SectionTitle } from "@/components/ui";
import Glossary from "@/components/Glossary";

export const dynamic = "force-dynamic";

export default function GlossaryPage() {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="📖 Real-Estate Glossary"
        subtitle="Every term the team should know — our wholesaling language plus the Lux Blueprint luxury-development vocabulary. The same words we use in the scripts and on the underwriting calculator."
        accent="bg-brand-navy"
      />
      <Card className="bg-slate-50 p-4">
        <Glossary />
      </Card>
    </div>
  );
}
