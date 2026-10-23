import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { entriesFor, audiencesFor } from "@/lib/whats-new";

export const dynamic = "force-dynamic";

// 🆕 What's New — the team rollout feed. New features land here the moment they ship,
// with a short how-to so anyone can use them without being shown (Jon 2026-10-22).
export default async function WhatsNewPage() {
  const me = await getCurrentUser();
  if (!me) return <Card className="p-10 text-center text-slate-400">Sign in to see what&apos;s new.</Card>;
  const entries = entriesFor(audiencesFor(me.position, isManager(me)));
  const fmt = (ymd: string) => { const d = new Date(ymd + "T00:00:00"); return d.toLocaleDateString([], { month: "short", day: "numeric" }); };
  const isNew = (ymd: string) => Date.parse(ymd + "T00:00:00") >= Date.now() - 10 * 86400000;

  return (
    <div className="space-y-5">
      <SectionTitle title="🆕 What's New" subtitle="New tools as they ship — with a quick how-to so you can use them right away. Check here whenever you see the New badge." accent="bg-emerald-500" />

      {entries.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400">Nothing new for your role right now.</Card>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xl">{e.emoji}</span>
                <span className="text-[15px] font-extrabold text-slate-800">{e.title}</span>
                {isNew(e.date) && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">NEW</span>}
                <span className="ml-auto text-[11px] font-semibold text-slate-400">{fmt(e.date)}</span>
              </div>
              <p className="mt-1 text-[13px] text-slate-600">{e.blurb}</p>

              <div className="mt-2.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">How to use it</div>
                <ol className="space-y-1.5">
                  {e.steps.map((s, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] text-slate-700">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-navy text-[10px] font-extrabold text-white">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {e.where && <Link href={e.where.href} className="rounded-lg bg-brand-navy px-3 py-1.5 text-[12px] font-bold text-white hover:bg-brand-navy-700">Go to {e.where.label} →</Link>}
                {e.playbook && <span className="text-[11px] text-slate-400">📘 More in the {e.playbook}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-l-4 border-slate-300 p-4 text-[12px] text-slate-500">
        Stuck on any screen? Tap the <b>Cortana</b> assistant (bottom-right) and it&apos;ll walk you through whatever you&apos;re looking at. Deeper walkthroughs live in <Link href="/tutorials" className="font-bold text-violet-600 hover:underline">🎬 Tutorials</Link>.
      </Card>
    </div>
  );
}
