import { redirect } from "next/navigation";
import { SectionTitle } from "@/components/ui";
import { getCurrentUser, canAccessMarketing } from "@/lib/auth";
import CascadeBoard from "@/components/CascadeBoard";

export const dynamic = "force-dynamic";

// Buyer Cascade (vetted-buyers Phase 3): deal in → ranked buyer call list out.
// Same access gate as Vetted Buyers (Sharyn, Marie, Jon, Viktoriia).
export default async function CascadePage() {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) redirect("/dashboard");
  return (
    <div className="space-y-5">
      <SectionTitle
        title="🎯 Buyer Cascade"
        subtitle="Type the deal — address, price, acres, asset type — and every vetted buyer is ranked by how well it fits their buy box. Call from the top."
        accent="bg-brand-gold"
      />
      <CascadeBoard />
    </div>
  );
}
