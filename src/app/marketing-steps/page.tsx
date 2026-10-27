// 📣 Marketing checklist editor (manager-only, Jon 2026-10-26). Edit the active/passive channel
// steps the team works on every dispo deal — no code change needed.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isManager } from "@/lib/auth";
import { readMarketingSteps } from "@/lib/dispo-marketing-store";
import { Card } from "@/components/ui";
import MarketingStepsEditor from "@/components/MarketingStepsEditor";

export const dynamic = "force-dynamic";

export default async function MarketingStepsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isManager(me)) redirect("/dispo");
  const steps = await readMarketingSteps();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link href="/dispo" className="text-sm font-bold text-slate-400 hover:text-slate-600">←</Link>
        <h1 className="text-lg font-extrabold text-slate-800">📣 Marketing checklist</h1>
      </div>
      <Card className="p-4">
        <p className="mb-4 text-sm text-slate-500">These are the steps that show on every dispo deal&apos;s marketing checklist. Edit, reorder, add or remove them here — changes go live on every deal instantly. A deal&apos;s existing checkmarks stay put when you rename a step.</p>
        <MarketingStepsEditor initial={steps} />
      </Card>
    </div>
  );
}
