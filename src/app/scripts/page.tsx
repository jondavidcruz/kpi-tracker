import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { CALL_TYPES } from "@/lib/call-types";
import { saveCallScript } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const GROUPS = ["Acquisitions", "Dispositions"] as const;

// Turn a plain-text script into a clean, scannable visual layout.
function renderScript(text: string) {
  return text.split("\n").map((line, i) => {
    const t = line.trim();
    if (!t) return <div key={i} className="h-2" />;
    if (/^(goal|objective|outcome|key)\s*:/i.test(t))
      return <div key={i} className="my-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">🎯 {t.replace(/^(goal|objective|outcome|key)\s*:\s*/i, "")}</div>;
    if ((t.endsWith(":") && t.length < 64 && t === t.toUpperCase()) || /—\s*foundations:?$/i.test(t)) {
      return <h3 key={i} className="mb-1 mt-4 text-sm font-bold uppercase tracking-wide text-brand-navy">{t.replace(/:$/, "")}</h3>;
    }
    const numbered = t.match(/^(\d+)[.)]\s+(.*)/);
    if (numbered)
      return <div key={i} className="flex gap-2.5 py-0.5 text-sm"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-gold/20 text-[11px] font-bold text-brand-navy">{numbered[1]}</span><span className="text-slate-700">{numbered[2]}</span></div>;
    if (/^[-•*]\s+/.test(t))
      return <div key={i} className="flex gap-2 py-0.5 text-sm text-slate-700"><span className="text-slate-300">•</span><span>{t.replace(/^[-•*]\s+/, "")}</span></div>;
    return <p key={i} className="py-0.5 text-sm leading-relaxed text-slate-700">{t}</p>;
  });
}

export default async function ScriptsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;
  const sp = await searchParams;
  const manager = isManager(me);
  const rows = await db.callScript.findMany();
  const scriptByType = new Map(rows.map((r) => [r.callType, r.script]));
  const selected = CALL_TYPES.find((c) => c.key === sp.type) ?? null;
  const selectedScript = selected ? scriptByType.get(selected.key) ?? "" : "";

  return (
    <div className="space-y-5">
      <SectionTitle
        title="📜 Scripts"
        subtitle="Click any script to open it — seller, buyer, agent, and developer scripts for every call."
        accent="bg-brand-gold"
        right={<a href="/scripts/master-guide.html" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-navy hover:underline">Full master guide ↗</a>}
      />

      {/* Portal — one card per script */}
      {GROUPS.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-sm font-bold text-slate-700">{g === "Acquisitions" ? "🎯 Acquisitions" : "📦 Dispositions"}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CALL_TYPES.filter((c) => c.group === g).map((c) => {
              const has = (scriptByType.get(c.key) ?? "").trim().length > 0;
              const active = selected?.key === c.key;
              return (
                <Link key={c.key} href={`/scripts?type=${c.key}#script`} className={`flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold ring-1 transition ${active ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-700 ring-slate-200 hover:ring-brand-gold/50"}`}>
                  <span>{c.label.replace(/^(AQ|DS):\s*/, "")}</span>
                  <span className={active ? "text-brand-gold-soft" : has ? "text-emerald-500" : "text-slate-300"}>{has ? "📄" : "—"}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {/* Selected script — visual view */}
      <Card className="p-5" id="script">
        {!selected ? (
          <p className="text-sm text-slate-400">Pick a script above to open it.</p>
        ) : selectedScript.trim() === "" ? (
          <div>
            <h2 className="mb-1 text-lg font-bold text-slate-800">{selected.label}</h2>
            <p className="text-sm text-slate-400">No script written for this call yet.{manager ? " Add it below." : ""}</p>
          </div>
        ) : (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">{selected.label}</h2>
              <Link href={`/call-scoring`} className="ml-auto rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">🎧 Score a call of this type →</Link>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">{renderScript(selectedScript)}</div>
          </div>
        )}

        {/* Manager edit */}
        {manager && selected && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-brand-navy">✏️ Edit this script</summary>
            <form action={saveCallScript} className="mt-2 space-y-2">
              <input type="hidden" name="callType" value={selected.key} />
              <textarea name="script" defaultValue={selectedScript} rows={14} placeholder={`Write the ${selected.label} script / foundations here…`} className={`${inputCls} font-mono text-xs`} />
              <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save script</button>
            </form>
          </details>
        )}
      </Card>
    </div>
  );
}
