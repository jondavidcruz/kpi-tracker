// 📋 Pull Priority — the one ranked answer to "which market do we pull next?" (Jon 2026-11-11).
// Combines land velocity + growth + buyers-waiting + clear-to-pull coverage into a single sorted
// list so planning is a glance, not a hunt across the map. Server component (static table).
type Row = {
  fips: string; name: string; state: string; tier: "target" | "watch";
  land30: number; land90: number; newCon90: number; yoy: number | null; buyers: number;
  coverage: "never" | "clear" | "cooldown"; cooldownLeft: number; hasTrends: boolean; priority: number;
};

function covChip(c: Row) {
  if (c.coverage === "cooldown") return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">🕒 cooldown {c.cooldownLeft}d</span>;
  if (c.coverage === "clear") return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">✅ clear to pull</span>;
  return <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">🆕 never pulled</span>;
}

export default function PullPriorityList({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  const anyTrends = rows.some((r) => r.hasTrends);
  return (
    <details open className="rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-4 py-3 text-[15px] font-black text-slate-800">
        📋 Pull Priority <span className="font-semibold text-slate-400">— pull these next (land velocity × buyers waiting × clear to pull)</span>
      </summary>
      <div className="overflow-x-auto px-2 pb-3">
        <table className="w-full min-w-[640px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
              <th className="px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">Market</th>
              <th className="px-2 py-1.5">Priority</th>
              <th className="px-2 py-1.5" title="Land parcels sold in the last 30 / 90 days">🌱 Land 30/90d</th>
              <th className="px-2 py-1.5" title="New-construction homes sold in the last 90 days">🏗 NewCon 90d</th>
              <th className="px-2 py-1.5" title="Land-sales year-over-year">📈 YoY</th>
              <th className="px-2 py-1.5" title="Vetted buyers whose buy-box covers this market">💰 Buyers</th>
              <th className="px-2 py-1.5">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.fips} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-1.5 font-bold text-slate-400">{i + 1}</td>
                <td className="px-2 py-1.5 font-bold text-slate-800">
                  {r.tier === "target" ? "🟢" : "🟠"} {r.name} <span className="font-semibold text-slate-400">{r.state}</span>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${r.priority}%` }} />
                    </div>
                    <span className="font-bold text-emerald-700">{r.priority}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 font-semibold text-slate-700">{r.hasTrends ? `${r.land30} / ${r.land90}` : "—"}</td>
                <td className="px-2 py-1.5 font-semibold text-slate-700">{r.hasTrends ? r.newCon90 : "—"}</td>
                <td className="px-2 py-1.5 font-bold" style={{ color: r.yoy == null ? "#94a3b8" : r.yoy >= 0 ? "#15803d" : "#b91c1c" }}>
                  {r.yoy == null ? "—" : `${r.yoy >= 0 ? "+" : ""}${r.yoy}%`}
                </td>
                <td className="px-2 py-1.5 font-bold" style={{ color: r.buyers > 0 ? "#0d9488" : "#94a3b8" }}>{r.buyers > 0 ? r.buyers : "—"}</td>
                <td className="px-2 py-1.5">{covChip(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!anyTrends && <p className="px-2 pt-2 text-[11px] text-slate-400">Land-velocity numbers fill in after the next market refresh (daily, or hit 🔄 Refresh on Market Finder).</p>}
      </div>
    </details>
  );
}
