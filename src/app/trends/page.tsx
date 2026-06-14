import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getMonthlyHistory, derive, type YearData } from "@/lib/history";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (n: number | null) => (n === null || n === undefined ? "—" : `$${Math.round(n).toLocaleString()}`);
const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString());

// Metric display order + labels for the annual table.
const ROWS: { key: string; label: string; fmt: (n: number) => string }[] = [
  { key: "dials", label: "Dials", fmt: (n) => Math.round(n).toLocaleString() },
  { key: "connects", label: "Connects", fmt: (n) => Math.round(n).toLocaleString() },
  { key: "leads", label: "Leads", fmt: (n) => Math.round(n).toLocaleString() },
  { key: "offers", label: "Offers made", fmt: (n) => Math.round(n).toLocaleString() },
  { key: "contracts", label: "Contracts", fmt: (n) => Math.round(n).toLocaleString() },
  { key: "sold_deals", label: "Deals closed", fmt: (n) => Math.round(n).toLocaleString() },
  { key: "expenses", label: "Marketing spend", fmt: (n) => money(n) },
  { key: "revenue", label: "Deal profit booked", fmt: (n) => money(n) },
];

function yoy(cur: number | undefined, prev: number | undefined): string | null {
  if (cur === undefined || prev === undefined || prev === 0) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

export default async function TrendsPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const years = await getMonthlyHistory();
  if (years.length === 0) {
    return <Card className="p-12 text-center text-slate-400">No historical data imported yet.</Card>;
  }

  // 24-month series across all imported years (for charts).
  const seriesOf = (metric: string, zeroFill: boolean) =>
    years.flatMap((y) => (y.monthly[metric] ?? Array(12).fill(null)).map((v) => (v === null ? (zeroFill ? 0 : null) : v)));
  const labelsOf = years.flatMap((y) => MONTHS.map((m, i) => (i === 0 ? `${m} '${String(y.year).slice(2)}` : m)));

  const latest = years[years.length - 1];
  const prev = years.length > 1 ? years[years.length - 2] : null;

  return (
    <div className="space-y-7">
      <SectionTitle title="📈 Multi-Year Trends" subtitle="Growth, year-over-year, and the cold-call → pay-per-lead shift" accent="bg-brand-gold" />

      {/* Narrative callout */}
      <Card className="p-5">
        <h3 className="mb-1 text-sm font-bold text-slate-700">The shift, in numbers</h3>
        <p className="text-sm text-slate-600">
          2024 ran on heavy outbound — <strong>{num(years.find((y) => y.year === 2024)?.total.dials ?? null)} dials</strong> to book{" "}
          <strong>{num(years.find((y) => y.year === 2024)?.total.leads ?? null)} leads</strong>. Through 2025 the team leaned off raw dialing and into
          pay-per-lead + sharper calling: fewer dials, but <strong>{num(years.find((y) => y.year === 2025)?.total.leads ?? null)} qualified cold-call leads</strong> and{" "}
          <strong>{money(years.find((y) => y.year === 2025)?.total.revenue ?? null)} in deal profit</strong>. The charts below show the curve.
        </p>
      </Card>

      {/* Annual summary table with YoY */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-slate-700">Annual summary</h3>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
                <th className="px-4 py-2.5 font-semibold">Metric</th>
                {years.map((y) => <th key={y.year} className="px-3 py-2.5 text-right font-semibold">{y.year}</th>)}
                {prev && <th className="px-3 py-2.5 text-right font-semibold text-slate-500">YoY</th>}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-700">{r.label}</td>
                  {years.map((y) => (
                    <td key={y.year} className="px-3 py-2 text-right tabular-nums">
                      {y.total[r.key] !== undefined ? r.fmt(y.total[r.key]) : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                  {prev && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{yoy(latest.total[r.key], prev.total[r.key]) ?? "—"}</td>}
                </tr>
              ))}
              {/* derived rows */}
              <DerivedRows years={years} prev={prev} latest={latest} />
            </tbody>
          </table>
        </Card>
        <p className="mt-2 text-xs text-slate-400">2024 from the monthly stats scorecard; 2025 cold-call connects/leads from the CC tracker and deal profit from closed deals. Blank = not tracked that year.</p>
      </section>

      {/* Monthly charts */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard title="Leads / month" data={seriesOf("leads", false)} labels={labelsOf} years={years} />
        <ChartCard title="Connects / month" data={seriesOf("connects", false)} labels={labelsOf} years={years} />
        <ChartCard title="Deal profit / month" data={seriesOf("revenue", true)} labels={labelsOf} years={years} money />
      </section>

      {/* Quarterly */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-slate-700">By quarter</h3>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {years.map((y) => <QuarterCard key={y.year} y={y} />)}
        </div>
      </section>

      {/* Insights */}
      <Insights years={years} />
    </div>
  );
}

function DerivedRows({ years, prev, latest }: { years: YearData[]; prev: YearData | null; latest: YearData }) {
  const d = (y: YearData) => derive(y.total);
  const cell = (v: number | null, fmt: (n: number) => string) => (v === null ? <span className="text-slate-300">—</span> : fmt(v));
  return (
    <>
      <tr className="border-b border-slate-100 bg-slate-50/40">
        <td className="px-4 py-2 font-medium text-slate-700">Net (profit − spend)</td>
        {years.map((y) => <td key={y.year} className="px-3 py-2 text-right tabular-nums">{cell(d(y).net, money)}</td>)}
        {prev && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{yoy(derive(latest.total).net ?? undefined, derive(prev.total).net ?? undefined) ?? "—"}</td>}
      </tr>
      <tr className="border-b border-slate-100 bg-slate-50/40">
        <td className="px-4 py-2 font-medium text-slate-700">Cost / lead</td>
        {years.map((y) => <td key={y.year} className="px-3 py-2 text-right tabular-nums">{cell(d(y).costPerLead, (n) => `$${Math.round(n)}`)}</td>)}
        {prev && <td className="px-3 py-2 text-right tabular-nums text-slate-500">—</td>}
      </tr>
      <tr className="bg-slate-50/40">
        <td className="px-4 py-2 font-medium text-slate-700">Profit / deal</td>
        {years.map((y) => <td key={y.year} className="px-3 py-2 text-right tabular-nums">{cell(d(y).profitPerDeal, money)}</td>)}
        {prev && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{yoy(derive(latest.total).profitPerDeal ?? undefined, derive(prev.total).profitPerDeal ?? undefined) ?? "—"}</td>}
      </tr>
    </>
  );
}

function ChartCard({ title, data, labels, years, money: isMoney }: { title: string; data: (number | null)[]; labels: string[]; years: YearData[]; money?: boolean }) {
  const w = 320, h = 110, pad = 6;
  const vals = data.filter((v): v is number => v !== null);
  const max = vals.length ? Math.max(...vals) : 1;
  const min = 0;
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  // build path, breaking on null
  let dpath = "";
  data.forEach((v, i) => {
    if (v === null) { dpath += " "; return; }
    dpath += `${dpath.trim().endsWith("") && (i === 0 || data[i - 1] === null) ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  // year boundary x (start of each year after the first)
  const boundaries = years.slice(1).map((_, idx) => x((idx + 1) * 12));
  return (
    <Card className="p-4">
      <div className="mb-1 text-sm font-semibold text-slate-700">{title}</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" aria-hidden>
        {boundaries.map((bx, i) => <line key={i} x1={bx} y1={pad} x2={bx} y2={h - pad} stroke="#e2e8f0" strokeDasharray="3 3" />)}
        <path d={dpath} fill="none" stroke="#c8a24b" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{labels[0]}</span>
        <span>peak {isMoney ? money(max) : Math.round(max).toLocaleString()}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </Card>
  );
}

function QuarterCard({ y }: { y: YearData }) {
  const q = (metric: string, qi: number) => {
    const m = y.monthly[metric];
    if (!m) return null;
    const slice = m.slice(qi * 3, qi * 3 + 3).filter((v): v is number => v !== null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) : null;
  };
  const metrics = [["leads", "Leads"], ["sold_deals", "Deals"], ["revenue", "Profit"]] as const;
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-bold text-slate-700">{y.year}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400"><th className="pb-1">Quarter</th>{metrics.map(([k, l]) => <th key={k} className="pb-1 text-right">{l}</th>)}</tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3].map((qi) => (
            <tr key={qi} className="border-t border-slate-100">
              <td className="py-1.5 font-medium text-slate-600">Q{qi + 1}</td>
              {metrics.map(([k]) => {
                const v = q(k, qi);
                return <td key={k} className="py-1.5 text-right tabular-nums">{v === null ? <span className="text-slate-300">—</span> : k === "revenue" ? money(v) : Math.round(v).toLocaleString()}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Insights({ years }: { years: YearData[] }) {
  const y24 = years.find((y) => y.year === 2024);
  const y25 = years.find((y) => y.year === 2025);
  const out: string[] = [];
  if (y24 && y25) {
    const d24 = derive(y24.total), d25 = derive(y25.total);
    if (d24.profitPerDeal && d25.profitPerDeal) {
      const up = Math.round(((d25.profitPerDeal - d24.profitPerDeal) / d24.profitPerDeal) * 100);
      out.push(`Profit per deal moved ${up >= 0 ? "up" : "down"} ${Math.abs(up)}% (${money(d24.profitPerDeal)} → ${money(d25.profitPerDeal)}) — fewer, bigger deals.`);
    }
    if (y24.total.leads && y25.total.leads) {
      out.push(`Cold-call qualified leads ${y25.total.leads >= y24.total.leads ? "rose" : "fell"} ${num(y24.total.leads)} → ${num(y25.total.leads)} even as raw dialing dropped — calling got more efficient before PPL took over.`);
    }
    if (d24.net !== null && y25.total.revenue) {
      out.push(`2025 booked ${money(y25.total.revenue)} in deal profit on just ${num(y25.total.sold_deals)} closings — the disposition margin is where the leverage is.`);
    }
  }
  out.push("Next: as 2026 months close, roll them into this view so every year compounds in one place — no more spreadsheets.");
  return (
    <Card className="p-5">
      <h3 className="mb-2 text-sm font-bold text-slate-700">Where this points</h3>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
        {out.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </Card>
  );
}
