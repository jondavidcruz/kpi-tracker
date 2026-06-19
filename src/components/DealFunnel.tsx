// A simple top-down deal funnel: Leads → Opportunities → Appointments → Offers
// → Contracts → Closed. Each bar's width is proportional to the top stage, and a
// badge shows the conversion rate from the previous stage. Pure server render.
export default function DealFunnel({ stages }: { stages: { label: string; count: number; source: string }[] }) {
  const top = Math.max(1, stages[0]?.count ?? 1);
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => {
        const widthPct = Math.max(26, Math.round((s.count / top) * 100));
        const prev = i > 0 ? stages[i - 1].count : null;
        const conv = prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <div className="w-32 shrink-0 text-right">
              <div className="text-xs font-semibold text-slate-600">{s.label}</div>
              <div className="text-[10px] leading-tight text-slate-400">{s.source}</div>
            </div>
            <div className="flex-1">
              <div
                className="mx-auto flex items-center justify-between gap-2 rounded-lg bg-gradient-to-r from-brand-navy to-brand-navy-700 px-3 py-2 text-white"
                style={{ width: `${widthPct}%` }}
              >
                <span className="text-lg font-extrabold tabular-nums">{Math.round(s.count).toLocaleString()}</span>
                {conv != null && (
                  <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold" title="Conversion from the stage above">
                    {conv}%
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
