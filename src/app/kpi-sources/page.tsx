import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { POSITIONS } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Where each KPI's number comes from. Keep this in sync when you change a pipeline
// stage or wiring. Anything not listed here is typed in manually by the rep.
const SOURCE: Record<string, { tag: string; how: string }> = {
  // 🟢 REI Reply CRM — calls (live every 15 min)
  acq_talk_time: { tag: "🟢 REI Reply", how: "Sum of connected call seconds" },
  ds_talk_time: { tag: "🟢 REI Reply", how: "Sum of connected call seconds" },
  buyers_contacted: { tag: "🟢 REI Reply", how: "Total dials (all call attempts)" },
  answered_calls: { tag: "🟢 REI Reply", how: "Calls that connected (any length)" },
  // 🟢 REI Reply CRM — pipeline stage moves
  offers_made: { tag: "🟢 REI Reply", how: "Card → ⚓ VERBAL OFFER stage" },
  acq_contracts_sent: { tag: "🟢 REI Reply", how: "Card → 📩 CONTRACT SENT stage" },
  contracts_signed: { tag: "🟢 REI Reply", how: "Card → 📝 CONTRACT SIGNED stage" },
  completed_process_calls: { tag: "🟢 REI Reply", how: "Card → COMP TO OFFER / REVIEW NUMBERS stage" },
  deals_comped: { tag: "🟢 REI Reply", how: "Card → 🧑‍⚖️ COMP REVIEW stage → credited to Marie" },
  // ✋ Manual — the CRM can't distinguish these, so reps enter them on Enter KPIs
  dev_conversations: { tag: "✋ Manual", how: "Developer conversations — CRM can't tell buyer type, so log manually" },
  buyer_conversations: { tag: "✋ Manual", how: "Fix/flipper conversations — CRM can't tell buyer type, so log manually" },
  deals_sold: { tag: "✋ Manual", how: "Off-market deals blasted to the buyer list (email/SMS) — ON MARKET ≠ sent" },
  // 🔵 Buyer Research (instant)
  new_buyers: { tag: "🔵 Buyer Research", how: "When you add a buyer/developer" },
  buy_boxes_captured: { tag: "🔵 Buyer Research", how: "When you fill in a buy box" },
  buyers_vetted: { tag: "🔵 Buyer Research", how: "When you mark a buyer ✓ Vetted" },
  developers_contacted: { tag: "🔵 Buyer Research", how: "When you 📇 log a touch" },
  // 🟡 In-app
  internet_speed: { tag: "🟡 In-app", how: "The Speed Test button on Enter KPIs" },
};
const MANUAL = { tag: "✋ Manual", how: "Typed in by the rep on Enter KPIs" };

const LEGEND = [
  ["🟢 REI Reply", "Auto from the CRM — calls + pipeline stages. Updates every 15 min (or hit 🔄 Sync now)."],
  ["🔵 Buyer Research", "Auto the instant a rep acts on the Buyer Research page."],
  ["🟡 In-app", "Captured by a tool inside the app."],
  ["✋ Manual", "Typed in by the rep — no automatic source."],
];

export default async function KpiSourcesPage() {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;
  const kpis = await db.kpi.findMany({ where: { active: true, scope: "per_rep" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });

  return (
    <div className="space-y-6">
      <SectionTitle title="📚 KPI Sources" subtitle="Where every KPI's number comes from — so you always know what's automatic vs. manual, and what to update if you change a pipeline stage." accent="bg-brand-gold" />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LEGEND.map(([tag, desc]) => (
            <div key={tag} className="flex gap-2 text-sm"><span className="shrink-0 font-semibold">{tag}</span><span className="text-slate-500">{desc}</span></div>
          ))}
        </div>
      </Card>

      {POSITIONS.map((pos) => {
        const rows = kpis.filter((k) => k.roleKey === pos.key);
        if (rows.length === 0) return null;
        return (
          <div key={pos.key}>
            <h2 className="mb-2 text-sm font-bold text-slate-700">{pos.emoji} {pos.label}</h2>
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-semibold">KPI</th>
                    <th className="px-3 py-2 font-semibold">Source</th>
                    <th className="px-3 py-2 font-semibold">How it's counted</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((k) => {
                    const s = SOURCE[k.key] ?? MANUAL;
                    return (
                      <tr key={k.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2 font-semibold text-slate-800">{k.emoji} {k.name}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{s.tag}</td>
                        <td className="px-3 py-2 text-slate-600">{s.how}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        );
      })}

      <Card className="bg-amber-50/60 p-4 text-xs text-amber-800 ring-1 ring-amber-200">
        <p><strong>*Conversations:</strong> right now Sharyn&apos;s connected calls feed Developer Conversations and Marie&apos;s feed Fix/Flipper Conversations. To make both exact for both reps, tag CRM contacts Developer vs Buyer.</p>
        <p className="mt-1"><strong>Changed a pipeline stage in REI Reply?</strong> Tell the app owner so the 🟢 mappings get updated — otherwise that KPI stops counting.</p>
      </Card>

      <Link href="/report" className="inline-block text-sm font-semibold text-brand-navy hover:underline">← Back to KPI Reports</Link>
    </div>
  );
}
