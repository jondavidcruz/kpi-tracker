// 📋 Pull Priority — the one ranked answer to "which market do we pull next?" (Jon 2026-11-11).
// Combines land velocity + growth + buyers-waiting + clear-to-pull coverage into a single sorted
// list so planning is a glance, not a hunt across the map. Server component (static table).
type Row = {
  fips: string; name: string; state: string; tier: "target" | "watch";
  land30: number; land90: number; land180: number;
  newCon30: number; newCon90: number; newCon180: number;
  yoy: number | null; buyers: number;
  ring: number; residual: number | null; testMarket: boolean; saturated?: boolean;
  wealth: number | null; landShare: number | null;
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
        📋 Pull Priority <span className="font-semibold text-slate-400">— pull these next (land velocity × buyers waiting × 🍩 conversion ring × clear to pull)</span>
        <span className="ml-1 text-[11px] font-normal text-fuchsia-500">· 🧪 = least-saturated test market</span>
      </summary>
      <div className="overflow-x-auto px-2 pb-3">
        <table className="w-full min-w-[640px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
              <th className="px-2 py-1.5" title="Rank by overall pull priority">#</th>
              <th className="px-2 py-1.5" title="The county. 🟢 = Target (pull next), 🟠 = Watch. 🧪 = least-saturated test market, 🏙 = big saturated metro (ranked down).">Market</th>
              <th className="px-2 py-1.5" title="Overall pull priority (0–100) = land velocity × buyers waiting × 🍩 conversion ring × clear-to-pull, with Target markets first and saturated metros penalized. Top of the list = pull next.">Priority</th>
              <th className="px-2 py-1.5" title="How many $50k+ LAND parcels actually SOLD in the last 30 / 90 / 180 days. John's core signal — real demand for land. More selling = a liquid, active market.">🌱 Land 30/90/180</th>
              <th className="px-2 py-1.5" title="New-construction homes SOLD in the last 30 / 90 / 180 days. The building frontier expanding outward — this is what pulls nearby land values up.">🏗 NewCon 30/90/180</th>
              <th className="px-2 py-1.5" title="🍩 CONVERSION RING (0–100): how actively cheap LAND is turning into HOUSING here. HIGH = lots of new building AND plenty of land still selling = the sweet spot where a builder will soon pay a premium for dirt. LOW = either maxed out (no land left) or dead (nobody building yet). Read it with coverage: a high ring we haven't pulled = go.">🍩 Ring</th>
              <th className="px-2 py-1.5" title="Est. BUILDER LAND BUDGET ≈ 15% of the area's finished-home price — a rough ceiling for what a builder could pay per lot (your offer guide). This is NOT the average land sale price; it's a derived budget. Always underwrite the real deal.">🏗 Builder $/lot</th>
              <th className="px-2 py-1.5" title="Area home price (wealth signal) — how affluent the area is. 💎 = $500k+ (wealthy). Not the land price; a proxy for buyer wealth + waterfront desirability.">💎 Wealth</th>
              <th className="px-2 py-1.5" title="Land SALES year-over-year — are more parcels selling than a year ago? Green/+ = market growing, red/− = cooling.">📈 YoY</th>
              <th className="px-2 py-1.5" title="How many of our VETTED buyers' buy-boxes cover this market — i.e. who we could sell the deal to. Pull where land is moving AND buyers are waiting.">💰 Buyers</th>
              <th className="px-2 py-1.5" title="Whether WE'VE pulled here: ✅ clear to pull · 🆕 never pulled · 🕒 cooldown (pulled recently, wait).">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.fips} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-2 py-1.5 font-bold text-slate-400">{i + 1}</td>
                <td className="px-2 py-1.5 font-bold text-slate-800">
                  {r.tier === "target" ? "🟢" : "🟠"} {r.name} <span className="font-semibold text-slate-400">{r.state}</span>
                  {r.testMarket && <span className="ml-1 rounded bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700" title="Test market: a conversion ring we can sell into (buyers) that we haven't saturated — least-competed ground to test leads">🧪 test</span>}
                  {r.saturated && <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-500" title="Big, heavily-worked metro — great market but saturated; ranked down in favor of less-competed ground">🏙 saturated</span>}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${r.priority}%` }} />
                    </div>
                    <span className="font-bold text-emerald-700">{r.priority}</span>
                  </div>
                </td>
                <td className="px-2 py-1.5 font-semibold text-slate-700 tabular-nums" title="$50k+ land parcels sold: 30 / 90 / 180 days">{r.hasTrends ? `${r.land30} / ${r.land90} / ${r.land180}` : "—"}</td>
                <td className="px-2 py-1.5 font-semibold text-slate-700 tabular-nums" title="New-construction homes sold: 30 / 90 / 180 days">{r.hasTrends ? `${r.newCon30} / ${r.newCon90} / ${r.newCon180}` : "—"}</td>
                <td className="px-2 py-1.5">
                  {r.ring > 0 ? (
                    <div className="flex items-center gap-1.5" title={r.ring >= 70 ? "Hot conversion zone — land actively turning into housing" : r.ring >= 40 ? "Moderate — some land→housing activity" : "Low — maxed out or not building yet"}>
                      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${r.ring}%` }} /></div>
                      <span className="font-bold text-fuchsia-700">{r.ring}</span>
                    </div>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-2 py-1.5 font-semibold text-slate-600" title="Rough builder land budget (~15% of finished-home price) — not the avg land sale price">{r.residual != null ? `~$${Math.round(r.residual / 1000)}k` : "—"}</td>
                <td className="px-2 py-1.5 font-semibold" title={r.wealth != null ? `Area home price — ${r.wealth >= 500000 ? "wealthy area" : "moderate"}${r.landShare != null ? ` · ${Math.round(r.landShare * 100)}% of land ≥$100k` : ""}` : ""}>
                  {r.wealth != null ? <span className={r.wealth >= 500000 ? "text-violet-700" : "text-slate-500"}>{r.wealth >= 500000 ? "💎 " : ""}${Math.round(r.wealth / 1000)}k</span> : <span className="text-slate-300">—</span>}
                </td>
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
