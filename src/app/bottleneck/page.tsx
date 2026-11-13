import Link from "next/link";
import { getCurrentUser, canAccessCSuite, isOwner } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { buildBottleneck, type Light } from "@/lib/bottleneck";
import { Card, SectionTitle } from "@/components/ui";
import { sendBottleneckNow } from "./actions";

export const dynamic = "force-dynamic";

const DOT: Record<Light, string> = { red: "bg-red-500", yellow: "bg-amber-500", green: "bg-emerald-500" };
const BORDER: Record<Light, string> = { red: "border-red-500", yellow: "border-amber-500", green: "border-emerald-500" };
const WASH: Record<Light, string> = { red: "bg-red-50/70", yellow: "bg-amber-50/70", green: "bg-emerald-50/70" };

export default async function BottleneckPage({ searchParams }: { searchParams: Promise<{ sent?: string; chat?: string; mail?: string }> }) {
  const me = await getCurrentUser();
  if (!me || !canAccessCSuite(me)) {
    return <Card className="mx-auto max-w-md p-8 text-center text-slate-500">🔒 The bottleneck audit is restricted to the C-suite (Jon, Viktoriia, Enrico).</Card>;
  }
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const b = await buildBottleneck(today);
  const biggest = b.levers.find((l) => l.key === b.biggestKey)!;
  const owner = isOwner(me);

  // Buyer funnel bars (the 105 → sold story).
  const g = b.gap;
  const steps = [
    { label: "Vetted buyers", n: g.vetted, tone: "bg-brand-navy" },
    { label: "Ever sent a deal", n: g.sentTo, tone: "bg-indigo-500" },
    { label: "Replied", n: g.responded, tone: "bg-sky-500" },
    { label: "Made an offer", n: g.offered, tone: "bg-amber-500" },
    { label: "Bought (closed)", n: g.soldTo, tone: "bg-emerald-500" },
  ];
  const fmax = Math.max(...steps.map((s) => s.n), 1);

  return (
    <div className="space-y-5">
      <SectionTitle title="🩺 War Room Bottleneck" subtitle="Where the machine leaks across marketing, acquisitions & dispositions — the one weekly read, live from your data."
        accent="bg-red-400" right={<span className="text-xs text-slate-400">C-suite only</span>} />

      {sp.sent === "1" && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
          ✓ Report delivered — chat {sp.chat === "1" ? "✅" : "⚠️ not wired yet"} · email {sp.mail === "1" ? "✅" : "⚠️ not configured"}.
        </div>
      )}
      {sp.sent === "denied" && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200">Owner only.</div>}

      {/* Biggest leak */}
      <Card className={`border-l-4 ${BORDER[biggest.light]} ${WASH[biggest.light]} p-4`}>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">🚨 Biggest bottleneck this week</div>
        <div className="mt-0.5 text-base font-extrabold text-slate-800">{biggest.title}</div>
        <div className="mt-1 text-sm text-slate-700">{biggest.headline}</div>
        <div className="mt-3 rounded-lg bg-white/70 p-3 ring-1 ring-slate-200">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-700">✅ Fix this weekend</div>
          <ol className="space-y-1 text-sm text-slate-700">
            {biggest.actions.map((a, i) => <li key={i} className="flex gap-2"><span className="font-bold text-emerald-600">{i + 1}.</span><span>{a}</span></li>)}
          </ol>
        </div>
      </Card>

      {/* Three levers */}
      <div className="grid gap-3 lg:grid-cols-3">
        {b.levers.map((l) => (
          <Card key={l.key} className={`border-t-4 ${BORDER[l.light]} p-4`}>
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${DOT[l.light]}`} />
              <span className="text-sm font-extrabold text-slate-800">{l.title}</span>
            </div>
            <div className="mt-1.5 text-sm text-slate-700">{l.headline}</div>
            {l.wow && <div className="mt-1 text-xs font-semibold text-slate-400">{l.wow}</div>}
            {l.bullets.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {l.bullets.map((x, i) => <li key={i} className="flex gap-1.5"><span className="text-slate-300">•</span><span>{x}</span></li>)}
              </ul>
            )}
            <div className="mt-2.5 rounded-lg bg-emerald-50 p-2.5 ring-1 ring-emerald-100">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">3 fixes</div>
              <ul className="space-y-1 text-xs text-emerald-900">
                {l.actions.map((a, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-500">›</span><span>{a}</span></li>)}
              </ul>
            </div>
          </Card>
        ))}
      </div>

      {/* The 105 → sold buyer funnel */}
      <Card className="p-5">
        <div className="mb-1 text-sm font-bold text-slate-700">Vetted-buyer funnel — why the buyer list isn&apos;t turning into sales</div>
        <p className="mb-3 text-xs text-slate-400">How far our vetted buyers actually get. A big drop at &ldquo;Ever sent a deal&rdquo; = a distribution problem (the list is fine, we just aren&apos;t sending to them). A big drop after that = a price/match problem.</p>
        <div className="space-y-2.5">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-32 shrink-0 text-right text-sm text-slate-600">{s.label}</div>
              <div className="flex flex-1 items-center gap-2">
                <div className={`flex h-8 min-w-12 items-center rounded-md px-2.5 text-sm font-bold text-white ${s.tone}`} style={{ width: `${Math.max(8, (s.n / fmax) * 100)}%` }}>{s.n.toLocaleString()}</div>
                {i > 0 && <div className="text-xs text-slate-400">{steps[i - 1].n > 0 ? `${Math.round((s.n / steps[i - 1].n) * 100)}% of prev` : "—"}</div>}
              </div>
            </div>
          ))}
        </div>
        {g.soldAny !== g.soldTo && <p className="mt-3 text-xs text-amber-600">Note: {g.soldAny} buyer(s) have closed across the whole send ledger (incl. buyers since archived); {g.soldTo} are in today&apos;s vetted set.</p>}
        <p className="mt-2 text-[11px] text-slate-400">Sold-to is measured from the cascade send ledger — a deal closed with a buyer found outside the cascade won&apos;t appear here. Log those sends so this stays honest.</p>
      </Card>

      {/* Verdict */}
      <Card className={`p-4 ${b.closer === false ? "border-l-4 border-red-500 bg-red-50/60" : "border-l-4 border-emerald-500 bg-emerald-50/60"}`}>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Closer to SOLD than last week?</div>
        <div className="mt-0.5 text-sm font-semibold text-slate-800">{b.verdict}</div>
        {b.prevDate && <div className="mt-1 text-xs text-slate-400">Compared against the {b.prevDate} snapshot.</div>}
      </Card>

      {/* Drill-downs + deliver */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-bold text-slate-700">Go deeper</div>
        <div className="flex flex-wrap gap-2">
          {[
            { href: "/leaks", label: "📞 Acquisitions funnel & economics" },
            { href: "/dispo?tab=team", label: "🤝 Dispo velocity" },
            { href: "/markets", label: "🎯 Target markets" },
            { href: "/marketing", label: "🏢 Vetted buyers & cascade" },
          ].map((d) => (
            <Link key={d.href} href={d.href} className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">{d.label}</Link>
          ))}
        </div>
        {owner && (
          <form action={sendBottleneckNow} className="mt-4 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <button className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:opacity-90">📨 Send this report now</button>
              <span className="text-xs text-slate-400">Posts to the Ops chat space + emails the C-suite. The Friday 7–8 AM cron does this automatically.</span>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
