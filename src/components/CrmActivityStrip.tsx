import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { Card } from "@/components/ui";

// Today's CRM activity per rep, pulled from REI Reply on each sync — a quick read on
// who's actually working the CRM (dials, texts, emails, pipeline moves). Managers only.
export default async function CrmActivityStrip() {
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const rows = await db.crmActivity.findMany({ where: { date: today } });
  if (rows.length === 0) {
    return (
      <Card className="p-4">
        <div className="mb-1 text-sm font-bold text-slate-700">📋 CRM activity today</div>
        <p className="text-xs text-slate-400">No CRM activity synced yet today — it auto-pulls from REI Reply through the day and finalizes by end of day (calls, texts, emails, pipeline moves per rep).</p>
      </Card>
    );
  }
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const ranked = rows
    .map((r) => ({ ...r, name: nameById.get(r.userId) ?? "—" }))
    .sort((a, b) => b.total - a.total);
  const top = Math.max(...ranked.map((r) => r.total), 1);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-bold text-slate-700">📋 CRM activity today</div>
        <div className="text-[11px] text-slate-400">dials · texts · emails · pipeline moves</div>
      </div>
      <div className="space-y-3">
        {ranked.map((r) => (
          <div key={r.userId} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
            <div className="flex w-28 shrink-0 items-baseline gap-1.5">
              <span className="text-sm font-semibold text-slate-800">{r.name.split(" ")[0]}</span>
              <span className="text-xs font-bold tabular-nums text-brand-navy">{r.total}</span>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <div className="h-6 rounded-md bg-brand-navy" style={{ width: `${Math.max(4, (r.total / top) * 100)}%` }} />
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">📞 {r.calls} calls</span>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">💬 {r.texts} texts</span>
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">✉️ {r.emails} emails</span>
                <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">↗ {r.stageMoves} moves</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">From REI Reply. The full click-by-click audit log lives in REI Reply → Settings → Audit Logs.</p>
    </Card>
  );
}
