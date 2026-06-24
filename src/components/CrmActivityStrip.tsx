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
        <p className="text-xs text-slate-400">No CRM activity synced yet today. Hit <strong>↻ Refresh CRM</strong> at the top of this page to pull it now (calls, texts, emails, pipeline moves) — it also fills automatically on each daily sync.</p>
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
      <div className="space-y-2.5">
        {ranked.map((r) => (
          <div key={r.userId} className="flex items-center gap-3">
            <div className="w-28 shrink-0 truncate text-sm font-medium text-slate-700">{r.name.split(" ")[0]}</div>
            <div className="flex flex-1 items-center gap-2">
              <div className="flex h-7 min-w-10 items-center rounded-md bg-brand-navy px-2.5 text-sm font-bold text-white" style={{ width: `${Math.max(10, (r.total / top) * 100)}%` }}>{r.total}</div>
              <div className="text-[11px] text-slate-400">{r.calls}📞 · {r.texts}💬 · {r.emails}✉️ · {r.stageMoves}↗</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">From REI Reply. The full click-by-click audit log lives in REI Reply → Settings → Audit Logs.</p>
    </Card>
  );
}
