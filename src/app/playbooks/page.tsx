import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SectionTitle } from "@/components/ui";
import { PLAYBOOKS, PLAYBOOK_CATEGORIES } from "@/lib/playbooks-data";
import PlaybookCard from "@/components/PlaybookCard";

export const dynamic = "force-dynamic";

// 📚 Playbooks — shared with the WHOLE team (Jon 2026-10-19). Our proprietary land
// plays ("Land Courses") are intentionally excluded here; they live C-suite-only on
// the Land Master Plan. Any signed-in teammate can read these.
export default async function PlaybooksPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  return (
    <div className="space-y-5">
      <SectionTitle title="📚 Playbooks" subtitle="Reference guides on how deals actually get done — taught visually: follow the pipeline, the numbered steps, and the highlighted numbers." accent="bg-brand-gold" />

      {PLAYBOOK_CATEGORIES.map((cat) => {
        const items = PLAYBOOKS.filter((p) => p.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{cat}</div>
            {items.map((pb) => <PlaybookCard key={pb.key} pb={pb} />)}
          </div>
        );
      })}

      <p className="text-[11px] text-slate-400">For training only — always confirm contract language + closing structure with a licensed attorney and your title/escrow company before acting.</p>
    </div>
  );
}
