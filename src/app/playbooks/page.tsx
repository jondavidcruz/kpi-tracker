import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SectionTitle, Card } from "@/components/ui";
import { PLAYBOOKS, PLAYBOOK_CATEGORIES } from "@/lib/playbooks-data";

export const dynamic = "force-dynamic";

export default async function PlaybooksPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  return (
    <div className="space-y-5">
      <SectionTitle title="📚 Playbooks" subtitle="Reference guides on how deals actually get done — contracts, deposits, and closing mechanics. Read anytime; use them on live deals." accent="bg-brand-gold" />

      {PLAYBOOK_CATEGORIES.map((cat) => {
        const items = PLAYBOOKS.filter((p) => p.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{cat}</div>
            {items.map((pb) => (
              <Card key={pb.key} className="overflow-hidden p-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-slate-50">
                    <span className="text-2xl">{pb.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-slate-800">{pb.title}</span>
                      <span className="block text-[13px] text-slate-500">{pb.summary}</span>
                    </span>
                    <span className="text-slate-300 transition group-open:rotate-90">▶</span>
                  </summary>
                  <div className="space-y-3 border-t border-slate-100 p-4">
                    {pb.sections.map((s, i) => (
                      <div key={i}>
                        <div className="text-sm font-bold text-slate-700">{s.heading}</div>
                        {s.body && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{s.body}</p>}
                        {s.bullets && (
                          <ul className="mt-1 space-y-1">
                            {s.bullets.map((b, j) => <li key={j} className="text-[13px] leading-relaxed text-slate-600">• {b}</li>)}
                          </ul>
                        )}
                        {s.tip && <p className="mt-1 rounded-lg bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800 ring-1 ring-amber-100">★ {s.tip}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              </Card>
            ))}
          </div>
        );
      })}

      <p className="text-[11px] text-slate-400">For training only — always confirm contract language + closing structure with a licensed attorney and your title/escrow company before acting.</p>
    </div>
  );
}
