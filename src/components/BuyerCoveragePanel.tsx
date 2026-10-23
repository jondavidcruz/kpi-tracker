// 🗺 Buy-box coverage gaps (Jon 2026-10-22). Where do we have deals but no buyers,
// and buyers but no deals? Price / acreage / area, side by side. Tells acquisitions
// what NOT to chase and what buyer to source next. Presentational — data from
// getBuyerCoverage().
import { Card } from "@/components/ui";
import type { Coverage, BandCoverage, AreaCoverage } from "@/lib/buyer-coverage";

const STATUS: Record<string, { pill: string; dot: string; label: string }> = {
  gap: { pill: "bg-rose-100 text-rose-700", dot: "bg-rose-500", label: "No buyers" },
  thin: { pill: "bg-amber-100 text-amber-700", dot: "bg-amber-500", label: "Thin" },
  ok: { pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", label: "Covered" },
  idle: { pill: "bg-sky-100 text-sky-700", dot: "bg-sky-400", label: "Buyers waiting" },
};

function Row({ label, buyers, deals, status }: { label: string; buyers: number; deals: number; status: string }) {
  const st = STATUS[status] ?? STATUS.ok;
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 odd:bg-slate-50/60">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800"><span className={`h-2 w-2 rounded-full ${st.dot}`} />{label}</span>
      <span className="text-right text-[11px] tabular-nums text-slate-500" title="open deals">{deals} <span className="text-slate-300">deal{deals === 1 ? "" : "s"}</span></span>
      <span className="text-right text-[11px] tabular-nums text-slate-500" title="vetted buyers">{buyers} <span className="text-slate-300">buyer{buyers === 1 ? "" : "s"}</span></span>
      <span className={`justify-self-end rounded-full px-1.5 py-0.5 text-[9px] font-bold ${st.pill}`}>{st.label}</span>
    </div>
  );
}

export default function BuyerCoveragePanel({ data }: { data: Coverage }) {
  const bandRows = (bands: BandCoverage[]) => bands.map((b) => <Row key={b.key} label={b.label} buyers={b.buyers} deals={b.deals} status={b.status} />);
  const areaRows = (areas: AreaCoverage[]) => areas.slice(0, 16).map((a) => <Row key={a.area} label={a.area.replace(/\b\w/g, (c) => c.toUpperCase())} buyers={a.buyers} deals={a.deals} status={a.status} />);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">🗺 Buy-box coverage</div>
        <span className="text-[11px] text-slate-500">{data.buyerCount} vetted buyers · {data.dealCount} open deals</span>
        <div className="ml-auto flex flex-wrap gap-2 text-[10px]">
          <Key dot="bg-rose-500" text="deals, no buyers" /><Key dot="bg-amber-500" text="thin" /><Key dot="bg-emerald-500" text="covered" /><Key dot="bg-sky-400" text="buyers waiting" />
        </div>
      </div>

      {data.topGaps.length > 0 && (
        <Card className="p-3 ring-1 ring-rose-200">
          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-rose-500">🚨 Source a buyer for these</div>
          <ul className="space-y-1">
            {data.topGaps.slice(0, 8).map((g, i) => <li key={i} className="flex items-start gap-1.5 text-[12px] text-slate-700"><span className="text-rose-500">•</span>{g}</li>)}
          </ul>
          <p className="mt-2 text-[10px] text-slate-400">These are deals we can&apos;t move until we vet a matching buyer — the sourcing priority list.</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="p-3">
          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">💵 By price band</div>
          <div className="space-y-0.5">{bandRows(data.price)}</div>
        </Card>
        <Card className="p-3">
          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">⛰️ By acreage</div>
          <div className="space-y-0.5">{bandRows(data.acre)}</div>
        </Card>
      </div>

      <Card className="p-3">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">📍 By area</span>
          <span className="text-[10px] text-slate-400">from buyers&apos; buy-boxes + deal locations (best-effort match)</span>
        </div>
        {data.areas.length === 0 ? <p className="px-2 py-3 text-center text-[11px] text-slate-400">Not enough area data on buy-boxes yet — fill in buyers&apos; target counties to light this up.</p>
          : <div className="space-y-0.5">{areaRows(data.areas)}</div>}
      </Card>
    </div>
  );
}

function Key({ dot, text }: { dot: string; text: string }) {
  return <span className="inline-flex items-center gap-1 text-slate-400"><span className={`h-2 w-2 rounded-full ${dot}`} />{text}</span>;
}
