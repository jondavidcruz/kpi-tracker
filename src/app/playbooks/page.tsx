import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SectionTitle, Card } from "@/components/ui";
import { PLAYBOOKS, PLAYBOOK_CATEGORIES } from "@/lib/playbooks-data";
import PlaybookDiagram from "@/components/PlaybookDiagram";

export const dynamic = "force-dynamic";

// Highlight the numbers that matter — dollar amounts, percentages, fractions,
// day/month counts — so a skimmer's eye lands on the money math first.
function hi(text: string): React.ReactNode {
  const parts = text.split(/(\$[\d,.]+(?:[kKMm])?(?:\s*[–\-]\s*\$?[\d,.]+[kKMm]?)?|\b\d+(?:\.\d+)?%|⅓|⅔|½|¼|\b\d+[–\-]\d+\s*(?:days?|months?|weeks?|hrs?|hours?)\b|\b\d+\s*(?:days?|months?|weeks?)\b)/g);
  return parts.map((p, i) =>
    i % 2 === 1
      ? <strong key={i} className="rounded bg-emerald-50 px-1 font-extrabold text-emerald-700">{p}</strong>
      : <span key={i}>{p}</span>,
  );
}

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
                  <div className="space-y-4 border-t border-slate-100 p-4">
                    {/* The model at a glance — a left-to-right pipeline */}
                    {pb.flow && pb.flow.length > 0 && (
                      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">The model in one line</div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {pb.flow.map((f, i) => (
                            <span key={i} className="flex items-center gap-1.5">
                              <span className="flex items-center gap-1.5 rounded-lg border-2 border-brand-navy/20 bg-white px-2.5 py-1.5 text-[12px] font-bold text-slate-700 shadow-sm">
                                <span className="text-base">{f.emoji}</span>{f.label}
                              </span>
                              {i < pb.flow!.length - 1 && <span className="text-sm font-bold text-slate-300">→</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* The numbers that matter — big stat tiles */}
                    {pb.stats && pb.stats.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {pb.stats.map((s, i) => (
                          <div key={i} className="rounded-xl border-2 border-emerald-100 bg-emerald-50/60 p-2.5 text-center">
                            <div className="text-lg font-extrabold leading-tight text-emerald-700">{s.value}</div>
                            <div className="mt-0.5 text-[10.5px] font-semibold leading-tight text-slate-500">{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* The REAL document first — the whole point is students see our actual contracts. */}
                    {pb.images && pb.images.length > 0 && (
                      <div className="space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="text-[13px] font-bold text-brand-navy">📄 Our actual document — this is the real thing</div>
                        {pb.images.map((img, i) => (
                          <figure key={i} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.src} alt={img.caption || pb.title} className="w-full" />
                            {img.caption && <figcaption className="bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">{img.caption}</figcaption>}
                          </figure>
                        ))}
                        {pb.pdfUrl && (
                          <a href={pb.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-brand-navy-700">📄 Open the full {pb.pdfLabel || "document"} (PDF)</a>
                        )}
                      </div>
                    )}
                    {pb.diagram && <PlaybookDiagram kind={pb.diagram} />}

                    {/* Sections as a numbered visual journey (chip + connector line) */}
                    <ol className="relative space-y-0">
                      {pb.sections.map((s, i) => (
                        <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                          {/* connector */}
                          {i < pb.sections.length - 1 && <span className="absolute left-[13px] top-7 h-full w-0.5 bg-slate-100" aria-hidden />}
                          <span className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[12px] font-extrabold text-white">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-extrabold text-slate-800">{s.heading}</div>
                            {s.body && <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{hi(s.body)}</p>}
                            {s.bullets && (
                              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                                {s.bullets.map((b, j) => (
                                  <div key={j} className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-[12.5px] leading-snug text-slate-600">
                                    {/^[✅🚫⚠️🔎💡★•\-]|^[\u{1F300}-\u{1FAFF}]/u.test(b) ? "" : "✅ "}{hi(b)}
                                  </div>
                                ))}
                              </div>
                            )}
                            {s.tip && <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-800 ring-1 ring-amber-200">💡 {hi(s.tip)}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>

                    {pb.callouts && pb.callouts.length > 0 && (
                      <div className="space-y-1.5">
                        {pb.callouts.map((c, i) => (
                          <div key={i} className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2">
                            <div className="text-[13px] font-bold text-amber-900">🔎 {c.label}</div>
                            <div className="text-[12px] text-amber-800">{hi(c.note)}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* For image-less guides, keep the PDF link at the bottom. */}
                    {pb.pdfUrl && (!pb.images || pb.images.length === 0) && (
                      <a href={pb.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-brand-navy-700">📄 Open {pb.pdfLabel || "the document"} (PDF)</a>
                    )}
                    {pb.courseUrl && (
                      <a href={pb.courseUrl} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700">{pb.courseLabel || "📚 Open the full course"}</a>
                    )}
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
