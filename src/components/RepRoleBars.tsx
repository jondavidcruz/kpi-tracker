import { formatValue, type Unit } from "@/lib/format";
import { KpiLabel } from "@/lib/kpiIcons";
import { Card } from "@/components/ui";

type Kpi = { id: string; key: string; name: string; unit: string; goalKind: string; goalValue: number | null };
export type RepCell = { value: number; pct: number | null; status: "hit" | "close" | "miss" | "tracked"; goalText?: string };

// "tracked" = a logged activity with no pass/fail goal (talk time, etc.) — show it in
// sky blue (matches the 🔵 activity legend) so a full bar reads as "logged," not the
// old gray that looked like an unfinished/empty metric.
const BAR: Record<string, string> = { hit: "bg-emerald-500", close: "bg-amber-500", miss: "bg-red-500", tracked: "bg-sky-400" };
const TXT: Record<string, string> = { hit: "text-emerald-600", close: "text-amber-600", miss: "text-red-600", tracked: "text-sky-700" };

/** Per-rep KPIs read top-to-bottom with color-coded bars (one card per rep). */
export default function RepRoleBars({ emoji, label, reps, kpis, cell }: {
  emoji: string; label: string;
  reps: { id: string; name: string }[];
  kpis: Kpi[];
  cell: (repId: string, kpi: Kpi) => RepCell;
}) {
  if (reps.length === 0 || kpis.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-slate-600">{emoji} {label}</h3>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {reps.map((rep) => (
          <Card key={rep.id} className="overflow-hidden p-0">
            <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 font-bold text-slate-800">{rep.name}</div>
            <div className="divide-y divide-slate-100">
              {kpis.map((k) => {
                const c = cell(rep.id, k);
                return (
                  <div key={k.id} className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-600"><KpiLabel kpiKey={k.key} name={k.name} /></span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className={`text-base font-extrabold ${TXT[c.status]}`}>{formatValue(k.unit as Unit, c.value)}</span>
                        {c.goalText && <span className="text-xs text-slate-400"> {c.goalText}</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${BAR[c.status]}`} style={{ width: `${c.pct ?? (c.value > 0 ? 100 : 0)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
