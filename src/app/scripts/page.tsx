import { getCurrentUser } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ScriptsPage() {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;

  return (
    <div className="space-y-4">
      <SectionTitle
        title="📜 Scripts"
        subtitle="The master script guide — seller, buyer, and agent scripts for every department, in one place."
        accent="bg-brand-gold"
        right={<a href="/scripts/master-guide.html" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-navy hover:underline">Open full page ↗</a>}
      />
      <Card className="overflow-hidden p-0">
        <iframe
          src="/scripts/master-guide.html"
          title="Freedom Offers Master Script Guide"
          className="h-[82vh] w-full border-0 bg-white"
        />
      </Card>
    </div>
  );
}
