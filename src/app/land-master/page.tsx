import { redirect } from "next/navigation";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { PLAYBOOKS, LAND_COURSE_CATEGORY } from "@/lib/playbooks-data";
import PlaybookCard from "@/components/PlaybookCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Land Master Plan" };

// One-page visual master plan of all 3 land courses (John infill / Hunter rec / Lux
// luxury) + the proprietary Land Course playbooks merged in (Jon 2026-10-19: keep the
// land plays for ourselves — moved here out of the now team-wide Playbooks). The
// poster is a bespoke self-contained HTML in /public rendered in an iframe so its
// styling stays pixel-perfect; the land-course playbooks render natively below it.
export default async function LandMasterPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!canAccessCSuite(me)) return <Card className="mx-auto max-w-md p-10 text-center text-slate-400">🔒 The Land Master Plan is C-suite only.</Card>;

  const landCourses = PLAYBOOKS.filter((p) => p.category === LAND_COURSE_CATEGORY);

  return (
    <div className="space-y-6">
      <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
        <iframe
          src="/land-master-plan.html"
          title="Freedom Offers — Land Master Plan"
          className="block w-full border-0"
          style={{ height: "calc(100dvh - 1rem)" }}
        />
      </div>

      {landCourses.length > 0 && (
        <div className="space-y-3">
          <SectionTitle title="🔒 Land Plays — our proprietary courses" subtitle="Kept for ourselves (C-suite only) — the John Duong infill, Hunter P. recreational, and Tyson Smith Lux goldmine systems, plus the market-research cheat sheet. Not shared in the team Playbooks." accent="bg-brand-gold" />
          {landCourses.map((pb) => <PlaybookCard key={pb.key} pb={pb} />)}
        </div>
      )}
    </div>
  );
}
