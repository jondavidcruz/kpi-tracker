// 📊 Dispo velocity panel (roadmap B6) — buyer funnel + speed, on the /dispo Team tab.
// Pure presentational server component; data comes from getDispoVelocity (DealSend + Deal).
import type { DispoVelocity } from "@/lib/dispo-velocity";

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}
function days(n: number | null): string {
  if (n == null) return "—";
  if (n < 1) return `${Math.round(n * 24)}h`;
  return `${n % 1 === 0 ? n : n.toFixed(1)}d`;
}

export default function DispoVelocityPanel({ v }: { v: DispoVelocity }) {
  const f = v.funnel;
  const steps = [
    { label: "Sent", n: f.sent, tone: "bg-slate-100 text-slate-700", conv: null as string | null },
    { label: "Responded", n: f.responded, tone: "bg-sky-100 text-sky-800", conv: pct(f.responded, f.sent) },
    { label: "Offers", n: f.offers, tone: "bg-amber-100 text-amber-800", conv: pct(f.offers, f.responded) },
    { label: "Won", n: f.won, tone: "bg-emerald-100 text-emerald-800", conv: pct(f.won, f.offers) },
  ];
  const tiles = [
    { label: "Deals marketed", value: String(v.dealsMarketed), sub: "got ≥1 buyer send" },
    { label: "Drew an offer", value: `${v.dealsWithOffer}`, sub: `${pct(v.dealsWithOffer, v.dealsMarketed)} of marketed` },
    { label: "Signed → 1st buyer send", value: days(v.medToFirstTouchDays), sub: "median" },
    { label: "Send → 1st response", value: days(v.medToFirstResponseDays), sub: "median" },
  ];

  return (
    <div className="mb-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">📊 Dispo velocity — buyer funnel &amp; speed</span>
        <span className="ml-auto text-[10px] font-semibold text-slate-400">last {v.windowDays} days</span>
      </div>

      {/* Funnel */}
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {steps.map((s) => (
          <div key={s.label} className={`rounded-xl px-2.5 py-2 ${s.tone}`}>
            <div className="text-[18px] font-extrabold tabular-nums leading-none">{s.n.toLocaleString()}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-80">{s.label}</div>
            {s.conv && <div className="text-[10px] font-semibold opacity-70">{s.conv} →</div>}
          </div>
        ))}
      </div>

      {/* Speed + conversion tiles */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
            <div className="text-[15px] font-extrabold tabular-nums text-slate-800">{t.value}</div>
            <div className="text-[10px] font-bold text-slate-500">{t.label}</div>
            <div className="text-[9.5px] text-slate-400">{t.sub}</div>
          </div>
        ))}
      </div>
      {v.funnel.sent === 0 && <p className="mt-2 text-[11px] text-slate-400">No buyer sends logged in this window yet — the funnel fills as deals go out to buyers (cascade or manual sends).</p>}
    </div>
  );
}
