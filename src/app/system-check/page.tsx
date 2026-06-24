import Link from "next/link";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { computeHealth, type CheckStatus } from "@/lib/health";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const STYLE: Record<CheckStatus, { ring: string; dot: string; text: string; label: string }> = {
  ok: { ring: "ring-emerald-200 bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-700", label: "Good" },
  warn: { ring: "ring-amber-200 bg-amber-50", dot: "bg-amber-400", text: "text-amber-700", label: "Needs attention" },
  down: { ring: "ring-red-300 bg-red-50", dot: "bg-red-500", text: "text-red-700", label: "Down" },
};
const OVERALL: Record<string, { bg: string; title: string; sub: string }> = {
  green: { bg: "from-emerald-500 to-emerald-600", title: "🟢 All systems good", sub: "Everything the War Room needs is connected and working." },
  yellow: { bg: "from-amber-400 to-amber-500", title: "🟡 Maintenance required", sub: "The team can work, but something below needs attention." },
  red: { bg: "from-red-500 to-red-600", title: "🔴 Major issue", sub: "Something critical is down — see the red item(s) below." },
};

export default async function SystemCheckPage() {
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">System Health — owner only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const health = await computeHealth();
  const o = OVERALL[health.overall];

  return (
    <div className="space-y-5">
      <SectionTitle title="🩺 System Health" subtitle="Live check of every system the War Room runs on. Only you can see this." accent="bg-slate-500" />

      <Card className={`border-0 bg-gradient-to-r p-5 text-white ${o.bg}`}>
        <div className="text-xl font-extrabold">{o.title}</div>
        <div className="mt-0.5 text-sm text-white/90">{o.sub}</div>
      </Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {health.checks.map((c) => {
          const s = STYLE[c.status];
          return (
            <div key={c.name} className={`flex items-start gap-3 rounded-xl p-3 ring-1 ${s.ring}`}>
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${s.dot} ${c.status !== "ok" ? "animate-pulse" : ""}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800">{c.name}</span>
                  {c.critical && <span className="rounded bg-slate-200 px-1.5 text-[9px] font-bold uppercase text-slate-600">critical</span>}
                  <span className={`ml-auto text-[10px] font-bold uppercase ${s.text}`}>{s.label}</span>
                </div>
                <div className="text-[12px] text-slate-600">{c.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400">Re-checked every time you open this page or hover the status dot by the logo. Most fixes are env vars in Vercel → Settings → Environment Variables (then redeploy).</p>
    </div>
  );
}
