import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { SCRIPTS } from "@/lib/scripts-data";

export const dynamic = "force-dynamic";

const GROUPS = ["Seller Scripts", "Buyer Scripts", "Agent Scripts"];

// Render one script line with styling based on its leading marker.
function Line({ text }: { text: string }) {
  const t = text.trim();
  if (t.startsWith("🎤"))
    return <div className="my-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-relaxed text-emerald-900 ring-1 ring-emerald-200"><span className="mr-1 font-bold text-emerald-600">Say:</span>{t.replace(/^🎤\s*/, "")}</div>;
  if (t.startsWith("❓"))
    return <p className="mt-1.5 text-sm font-semibold text-slate-700">{t}</p>;
  if (t.startsWith("⚠️"))
    return <div className="my-1 rounded-lg bg-amber-50 px-3 py-1.5 text-[13px] leading-relaxed text-amber-800 ring-1 ring-amber-200">{t}</div>;
  if (t.startsWith("💡"))
    return <div className="my-1 rounded-lg bg-sky-50 px-3 py-1.5 text-[13px] leading-relaxed text-sky-800 ring-1 ring-sky-200">{t}</div>;
  if (t.startsWith("→"))
    return <p className="ml-3 py-0.5 text-[13px] leading-relaxed text-slate-500">{t}</p>;
  return <p className="py-0.5 text-sm leading-relaxed text-slate-700">{t}</p>;
}

// One script step as a card. Cold/Warm openers get color + a badge so they read as a choice.
function StepCard({ st }: { st: { heading: string; body: string[] } }) {
  const isCold = /cold opener/i.test(st.heading);
  const isWarm = /warm opener/i.test(st.heading);
  const opener = isCold || isWarm;
  return (
    <div className={`h-full rounded-xl p-4 ring-1 ${opener ? (isCold ? "bg-sky-50 ring-sky-200" : "bg-orange-50 ring-orange-200") : "bg-slate-50 ring-slate-200"}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        {isCold && <span className="rounded-full bg-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">🥶 USE IF COLD</span>}
        {isWarm && <span className="rounded-full bg-orange-200 px-2 py-0.5 text-[10px] font-bold text-orange-800">🔥 USE IF WARM — already contacted</span>}
        <h3 className="text-sm font-bold text-brand-navy">{st.heading}</h3>
      </div>
      <div>{st.body.map((b, bi) => <Line key={bi} text={b} />)}</div>
    </div>
  );
}

export default async function ScriptsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;
  const sp = await searchParams;
  let i = SCRIPTS.findIndex((s) => s.key === sp.s);
  if (i < 0) i = 0;
  const cur = SCRIPTS[i];
  const prev = SCRIPTS[i - 1];
  const next = SCRIPTS[i + 1];

  return (
    <div className="space-y-5">
      <SectionTitle
        title="📜 Scripts"
        subtitle="Your full call scripts — word-for-word, step by step. Pick one, walk down it on the call, and use Prev/Next to move between them."
        accent="bg-brand-gold"
        right={<a href="/scripts/master-guide.html" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-navy hover:underline">Print view ↗</a>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_1fr]">
        {/* Script list */}
        <div className="space-y-4">
          {GROUPS.map((g) => {
            const items = SCRIPTS.filter((s) => s.group === g);
            if (!items.length) return null;
            return (
              <div key={g}>
                <div className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g}</div>
                <div className="space-y-1">
                  {items.map((s) => (
                    <Link
                      key={s.key}
                      href={`/scripts?s=${s.key}#top`}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition ${s.key === cur.key ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-700 ring-slate-200 hover:ring-brand-gold/50"}`}
                    >
                      <span>{s.icon}</span><span className="flex-1">{s.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected script */}
        <Card className="p-5" id="top">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800">{cur.icon} {cur.name}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Script {i + 1} of {SCRIPTS.length}</span>
            <Link href="/call-scoring" className="ml-auto rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">🎧 Score a call →</Link>
          </div>
          <p className="mb-4 text-sm text-slate-500">{cur.summary}</p>

          <div className="space-y-3">
            {(() => {
              const out: ReactNode[] = [];
              for (let i = 0; i < cur.steps.length; i++) {
                const st = cur.steps[i];
                const next = cur.steps[i + 1];
                // A Cold opener immediately followed by a Warm opener → render them SIDE BY SIDE
                // so the rep picks one column instead of reading down and using both.
                if (/cold opener/i.test(st.heading) && next && /warm opener/i.test(next.heading)) {
                  out.push(
                    <div key={i}>
                      <div className="mb-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">👉 Pick ONE opener — Cold or Warm, not both</div>
                      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
                        <StepCard st={st} />
                        <StepCard st={next} />
                      </div>
                    </div>
                  );
                  i++; // skip the warm step — already rendered in the pair
                } else {
                  out.push(<StepCard key={i} st={st} />);
                }
              }
              return out;
            })()}
          </div>

          {cur.objections.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-red-600">🛡️ Common objections</h3>
              <div className="space-y-2">
                {cur.objections.map((o, oi) => (
                  <div key={oi} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="text-sm font-semibold text-slate-800">“{o.objection}”</div>
                    <div className="mt-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm leading-relaxed text-emerald-900 ring-1 ring-emerald-200"><span className="mr-1 font-bold text-emerald-600">Say:</span>{o.response}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prev / Next nav */}
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {prev
              ? <Link href={`/scripts?s=${prev.key}#top`} className="max-w-[46%] truncate rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">← {prev.icon} {prev.name}</Link>
              : <span />}
            {next
              ? <Link href={`/scripts?s=${next.key}#top`} className="max-w-[46%] truncate rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">{next.icon} {next.name} →</Link>
              : <span />}
          </div>
        </Card>
      </div>
    </div>
  );
}
