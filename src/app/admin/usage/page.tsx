// 📊 Owner-only usage report (Jon 2026-11-04): which pages actually get used, so trimming
// clutter is driven by data. Fed by the UsageBeacon (one view/path/user/day). Flags nav
// pages with no views — or none in 30 days — as candidates to cut.
import { getCurrentUser, isOwner } from "@/lib/auth";
import { getUsage, normUsagePath } from "@/lib/usage";
import { NAV_GROUPS } from "@/lib/navItems";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

function daysAgo(iso: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400_000);
}

export default async function UsagePage() {
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <p className="mt-2 text-sm text-slate-500">Usage analytics are limited to the owner.</p>
      </div>
    );
  }

  const usage = await getUsage();
  const total = usage.reduce((s, r) => s + r.views, 0);
  const byPath = new Map(usage.map((r) => [r.path, r]));

  // Every nav destination (deduped), with its usage. "Unused" = never tracked or no view in 30d.
  const navItems = [...new Map(
    NAV_GROUPS.flatMap((g) => g.items.map((i) => [normUsagePath(i.href), { href: i.href, label: i.label, group: g.group }]))
  ).values()];
  const scored = navItems.map((n) => {
    const u = byPath.get(normUsagePath(n.href));
    return { ...n, views: u?.views ?? 0, last: u?.lastAt ?? "", age: u ? daysAgo(u.lastAt) : null };
  });
  const unused = scored.filter((s) => s.views === 0).sort((a, b) => a.label.localeCompare(b.label));
  const cold = scored.filter((s) => s.views > 0 && s.age != null && s.age >= 30).sort((a, b) => (b.age ?? 0) - (a.age ?? 0));

  const fmtLast = (iso: string) => { const d = daysAgo(iso); return d == null ? "—" : d <= 0 ? "today" : `${d}d ago`; };

  return (
    <div className="space-y-6">
      <SectionTitle title="📊 Page usage" subtitle="Which pages the team actually opens — so cutting clutter is driven by data, not guesses. Counts one view per page per person per day; tracking is lightweight by design." accent="bg-brand-gold" />

      {usage.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">
          No views recorded yet. Tracking just went live — check back in a day or two once the team has navigated around.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pages seen</div><div className="text-2xl font-extrabold text-slate-800">{usage.length}</div></Card>
            <Card className="p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Total views</div><div className="text-2xl font-extrabold text-slate-800">{total.toLocaleString()}</div></Card>
            <Card className="p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Nav pages unused</div><div className="text-2xl font-extrabold text-red-600">{unused.length}</div></Card>
            <Card className="p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Cold (30d+)</div><div className="text-2xl font-extrabold text-amber-600">{cold.length}</div></Card>
          </div>

          {(unused.length > 0 || cold.length > 0) && (
            <Card className="p-4">
              <div className="mb-2 text-sm font-bold text-slate-800">✂️ Trim candidates</div>
              <p className="mb-3 text-xs text-slate-500">Nav pages nobody is opening. Good candidates to remove or fold in — confirm with the team first (a page can be seasonal, like month-end).</p>
              {unused.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-red-500">Never opened (since tracking began)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {unused.map((s) => <span key={s.href} title={`${s.group} · ${s.href}`} className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">{s.label}</span>)}
                  </div>
                </div>
              )}
              {cold.length > 0 && (
                <div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-600">No views in 30+ days</div>
                  <div className="flex flex-wrap gap-1.5">
                    {cold.map((s) => <span key={s.href} title={`${s.group} · ${s.href} · last ${fmtLast(s.last)}`} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">{s.label} · {fmtLast(s.last)}</span>)}
                  </div>
                </div>
              )}
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-bold text-slate-800">📈 All tracked pages</div>
            <div className="max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr><th className="px-4 py-2 text-left font-bold">Page</th><th className="px-4 py-2 text-right font-bold">Views</th><th className="px-4 py-2 text-right font-bold">Last seen</th></tr>
                </thead>
                <tbody>
                  {usage.map((r) => (
                    <tr key={r.path} className="border-t border-slate-50">
                      <td className="px-4 py-1.5 font-mono text-[12px] text-slate-700">{r.path}</td>
                      <td className="px-4 py-1.5 text-right font-bold text-slate-800">{r.views.toLocaleString()}</td>
                      <td className="px-4 py-1.5 text-right text-[12px] text-slate-500">{fmtLast(r.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
