import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Land Master Plan" };

// One-page visual master plan of all 3 land courses (John infill / Hunter rec / Lux
// luxury). It's a bespoke, self-contained HTML poster in /public, rendered here in an
// iframe so its custom styling stays pixel-perfect and isolated from the app theme.
// Edit the design in public/land-master-plan.html.
export default async function LandMasterPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  return (
    <div className="-m-4 sm:-m-6">
      <iframe
        src="/land-master-plan.html"
        title="Freedom Offers — Land Master Plan"
        className="block w-full border-0"
        style={{ height: "calc(100dvh - 1rem)" }}
      />
    </div>
  );
}
