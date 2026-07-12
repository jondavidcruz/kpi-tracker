import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAllUsers, getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { quarterOf, quarterLabel } from "@/lib/eos";
import { savePeerAssessment } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";

const DIMS = [
  { key: "rComm", label: "Communication" },
  { key: "rFollow", label: "Follow-through" },
  { key: "rSkill", label: "Skill / craft" },
  { key: "rCoach", label: "Coachability" },
  { key: "rCulture", label: "Culture add" },
] as const;

type Row = { id: string; quarter: string; raterId: string; subjectId: string; superpower: string; strengths: string; growth: string; rComm: number; rFollow: number; rSkill: number; rCoach: number; rCulture: number };

const STOP = new Set("the a an and or but to of for with at in on is are be great good really very at very able always into your you they them their our we us has have who that this what when able".split(" "));
function topWords(texts: string[], n = 4): string[] {
  const count: Record<string, number> = {};
  for (const t of texts) for (const w of t.toLowerCase().split(/[^a-z]+/)) {
    if (w.length < 4 || STOP.has(w)) continue;
    count[w] = (count[w] || 0) + 1;
  }
  return Object.entries(count).sort((a, b) => b[1] - a[1]).filter(([, c]) => c >= 1).slice(0, n).map(([w]) => w);
}

export default async function Team360Page({ searchParams }: { searchParams: Promise<{ q?: string; saved?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const sp = await searchParams;
  const settings = await getSettings();
  const thisQuarter = quarterOf(todayStr(settings.orgTimezone));
  const quarter = sp.q && /^\d{4}-Q[1-4]$/.test(sp.q) ? sp.q : thisQuarter;
  const isCurrent = quarter === thisQuarter;

  const users = (await getAllUsers()).filter((u) => u.active);
  const nameById = new Map(users.map((u) => [u.id, u.name] as const));
  const firstName = (id: string) => (nameById.get(id) ?? "Someone").split(" ")[0];

  // Load the quarter's rows + the list of quarters that have data. If the table isn't there
  // yet (migration still catching up), degrade gracefully instead of erroring the page.
  let rows: Row[] = [];
  let quarters: string[] = [];
  let tableReady = true;
  try {
    rows = (await db.peerAssessment.findMany({ where: { quarter } })) as Row[];
    quarters = (await db.peerAssessment.findMany({ distinct: ["quarter"], select: { quarter: true }, orderBy: { quarter: "desc" } })).map((q) => q.quarter);
  } catch {
    tableReady = false;
  }
  if (!quarters.includes(thisQuarter)) quarters = [thisQuarter, ...quarters];

  const myRows = new Map(rows.filter((r) => r.raterId === me.id).map((r) => [r.subjectId, r] as const));
  const doneCount = users.filter((u) => myRows.has(u.id)).length;

  // Build each subject's result view from everyone's rows.
  const results = users.map((subj) => {
    const about = rows.filter((r) => r.subjectId === subj.id);
    const fromOthers = about.filter((r) => r.raterId !== subj.id);
    const self = about.find((r) => r.raterId === subj.id) ?? null;
    const supers = fromOthers.filter((r) => r.superpower.trim()).map((r) => ({ by: firstName(r.raterId), text: r.superpower.trim() }));
    const strengths = fromOthers.filter((r) => r.strengths.trim()).map((r) => ({ by: firstName(r.raterId), text: r.strengths.trim() }));
    const growth = fromOthers.filter((r) => r.growth.trim()).map((r) => r.growth.trim()); // anonymized — no names
    const dimStats = DIMS.map((d) => {
      const vals = fromOthers.map((r) => r[d.key]).filter((x) => x > 0);
      const team = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
      const selfVal = self ? (self[d.key] || 0) : 0;
      return { ...d, team, self: selfVal, gap: selfVal && team ? selfVal - team : 0 };
    });
    const tags = topWords([...supers.map((s) => s.text), ...strengths.map((s) => s.text)]);
    return { subj, count: fromOthers.length, supers, strengths, growth, dimStats, tags, self };
  });

  const bar = (val: number, color: string) => (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full ${color}`} style={{ width: `${(val / 5) * 100}%` }} />
    </div>
  );

  return (
    <div className="space-y-6">
      <SectionTitle title="🦸 Team 360 — Superpowers" subtitle="What is each person's superpower — and their biggest growth area? Everyone rates everyone (including themselves), so we each learn our strengths and blind spots." accent="bg-brand-gold" />

      {/* Quarter switcher */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400">Quarter:</span>
        {quarters.map((q) => (
          <Link key={q} href={`/team-360?q=${q}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${q === quarter ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{quarterLabel(q)}{q === thisQuarter ? " · now" : ""}</Link>
        ))}
      </div>

      {!tableReady && (
        <Card className="p-5 text-sm text-amber-800 ring-1 ring-amber-200 bg-amber-50">⏳ Team 360 is finishing its setup (the database is catching up). Refresh in a minute — nothing else in the war room is affected.</Card>
      )}

      {/* Hybrid transparency note */}
      <Card className="border-l-4 border-brand-gold bg-amber-50/40 p-4 text-[13px] text-slate-600">
        <b>How this works:</b> Strengths &amp; superpowers are shown <b>with your name</b> — give credit openly. Growth areas are pooled <b>anonymously</b> into themes, no names attached, so everyone can be honest. Your own self-rating shows next to the team&apos;s so you can spot the gap.
      </Card>

      {/* ─────────── RATE YOUR TEAM (current quarter only) ─────────── */}
      {isCurrent && (
        <section id="rate">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-700">✍️ Your reads — {quarterLabel(quarter)}</h3>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{doneCount} of {users.length} done</span>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {users.map((u) => {
              const mine = myRows.get(u.id);
              const isSelf = u.id === me.id;
              return (
                <details key={u.id} open={sp.saved === u.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-800">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-navy text-[11px] font-bold text-brand-gold-soft">{u.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                    {isSelf ? "Yourself (self-assessment)" : u.name}
                    {mine ? <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ submitted</span> : <span className="ml-auto text-[11px] text-slate-400">not yet</span>}
                  </summary>
                  <form action={savePeerAssessment} className="mt-3 space-y-2.5">
                    <input type="hidden" name="subjectId" value={u.id} />
                    <label className="block"><span className={labelCls}>{isSelf ? "My" : "Their"} superpower (one line)</span><input name="superpower" defaultValue={mine?.superpower ?? ""} maxLength={200} placeholder={isSelf ? "The one thing I'm best at…" : "The one thing they're best at…"} className={inputCls} /></label>
                    <label className="block"><span className={labelCls}>Strengths — what {isSelf ? "I'm" : "they're"} great at (shown with your name)</span><textarea name="strengths" defaultValue={mine?.strengths ?? ""} rows={2} className={inputCls} /></label>
                    <label className="block"><span className={labelCls}>Biggest growth area / blind spot (pooled anonymously)</span><textarea name="growth" defaultValue={mine?.growth ?? ""} rows={2} placeholder="What would 10x them if they worked on it?" className={inputCls} /></label>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
                      {DIMS.map((d) => (
                        <label key={d.key} className="text-[11px]"><span className="mb-0.5 block font-semibold text-slate-500">{d.label}</span>
                          <select name={d.key} defaultValue={String((mine?.[d.key as keyof Row] as number) ?? 0)} className={inputCls}>
                            <option value="0">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                    <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">{mine ? "Update" : "Submit"} my read on {isSelf ? "myself" : u.name.split(" ")[0]}</button>
                  </form>
                </details>
              );
            })}
          </div>
        </section>
      )}

      {/* ─────────── RESULTS ─────────── */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-slate-700">📊 Results — {quarterLabel(quarter)}</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {results.map(({ subj, count, supers, strengths, growth, dimStats, tags }) => (
            <Card key={subj.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-navy text-xs font-bold text-brand-gold-soft">{subj.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                <span className="text-base font-bold text-slate-800">{subj.name}</span>
                <span className="ml-auto text-[11px] text-slate-400">{count} teammate{count === 1 ? "" : "s"} weighed in</span>
              </div>
              {count === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No reads yet this quarter.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="rounded-full bg-brand-gold/20 px-2.5 py-0.5 text-[11px] font-bold capitalize text-amber-800">{t}</span>)}</div>
                  )}
                  {supers.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">🦸 Superpower</div>
                      <ul className="mt-0.5 space-y-0.5">{supers.map((s, i) => <li key={i} className="text-[13px] text-slate-700">“{s.text}” <span className="text-[11px] text-slate-400">— {s.by}</span></li>)}</ul>
                    </div>
                  )}
                  {strengths.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">💪 Strengths</div>
                      <ul className="mt-0.5 space-y-0.5">{strengths.map((s, i) => <li key={i} className="text-[13px] text-slate-700">{s.text} <span className="text-[11px] text-slate-400">— {s.by}</span></li>)}</ul>
                    </div>
                  )}
                  {growth.length > 0 && (
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-amber-600">🌱 Growth areas <span className="font-normal text-slate-400">(anonymous)</span></div>
                      <ul className="mt-0.5 space-y-0.5">{growth.map((g, i) => <li key={i} className="text-[13px] text-slate-600">• {g}</li>)}</ul>
                    </div>
                  )}
                  {/* Self vs team radar (bars) */}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-slate-500"><span>How the team sees you vs. yourself</span><span className="font-normal normal-case text-slate-400">team ▸ · you ◦</span></div>
                    <div className="space-y-1.5">
                      {dimStats.map((d) => (
                        <div key={d.key} className="grid grid-cols-[92px_1fr_auto] items-center gap-2">
                          <span className="text-[11px] text-slate-500">{d.label}</span>
                          <div className="space-y-0.5">{bar(d.team, "bg-brand-navy")}{d.self > 0 && bar(d.self, "bg-brand-gold")}</div>
                          <span className="text-[10px] tabular-nums text-slate-400">{d.team ? d.team.toFixed(1) : "—"}{d.self ? ` · ${d.self}` : ""}</span>
                        </div>
                      ))}
                    </div>
                    {dimStats.filter((d) => Math.abs(d.gap) >= 1.5).map((d) => (
                      <p key={d.key} className={`mt-1 rounded px-2 py-1 text-[11px] ${d.gap > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                        {d.gap > 0 ? `👀 Blind spot — you rate your ${d.label.toLowerCase()} higher than the team does.` : `✨ Hidden strength — the team rates your ${d.label.toLowerCase()} higher than you do.`}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
