import { formatValue, type Unit } from "@/lib/format";
import { KpiLabel } from "@/lib/kpiIcons";
import { Card } from "@/components/ui";

type Kpi = { id: string; key: string; name: string; unit: string; goalKind: string; goalValue: number | null };
export type RepCell = { value: number; pct: number | null; status: "hit" | "close" | "miss" | "tracked"; goalText?: string };
export type RepSection = { emoji: string; name: string; tone: "money" | "activity"; kpis: Kpi[] };

// "tracked" = a logged activity with no pass/fail goal (talk time, etc.) — show it in
// sky blue (matches the 🔵 activity legend) so a full bar reads as "logged," not the
// old gray that looked like an unfinished/empty metric.
const BAR: Record<string, string> = { hit: "bg-emerald-500", close: "bg-amber-500", miss: "bg-red-500", tracked: "bg-sky-400" };
const TXT: Record<string, string> = { hit: "text-emerald-600", close: "text-amber-600", miss: "text-red-600", tracked: "text-sky-700" };
// section tint: 💰 money = emerald, ⚡ activity = sky — the color does the
// grouping so each rep's name appears exactly ONCE (Jon 2026-10-08).
const SECTION = {
  money: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", edge: "border-l-emerald-400" },
  activity: { chip: "bg-sky-50 text-sky-700 ring-sky-200", edge: "border-l-sky-400" },
} as const;

/** One card per rep; Money + Activity live inside it as color-coded sections.
 *  Scales to 10+ reps — it's just more cards in the same grid. */
export default function RepRoleBars({ label, reps, sections, cell }: {
  label: string;
  reps: { id: string; name: string }[];
  sections: RepSection[];
  cell: (repId: string, kpi: Kpi) => RepCell;
}) {
  const live = sections.filter((s) => s.kpis.length > 0);
  if (reps.length === 0 || live.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-bold text-slate-600">{label}</h3>
        {live.map((s) => (
          <span key={s.name} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${SECTION[s.tone].chip}`}>{s.emoji} {s.name}</span>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {reps.map((rep) => (
          <Card key={rep.id} className="overflow-hidden p-0">
            <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 font-bold text-slate-800">{rep.name}</div>
            {live.map((s) => (
              <div key={s.name} className={`border-l-4 ${SECTION[s.tone].edge}`}>
                <div className={`px-4 pt-2 text-[10px] font-extrabold uppercase tracking-wide ${s.tone === "money" ? "text-emerald-600" : "text-sky-600"}`}>{s.emoji} {s.name}</div>
                <div className="divide-y divide-slate-100">
                  {s.kpis.map((k) => {
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
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
