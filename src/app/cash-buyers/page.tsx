import Link from "next/link";
import { getCurrentUser, isManager, canAccessMarketing } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { readBuyerFeed } from "@/lib/buyer-sheet";

export const dynamic = "force-dynamic";

// 💰 Cash Buyers — the latest daily DealMachine sourcing sheet (vacant-land cash
// buyers / developers in TX/FL/CA/TN/OK), ready to drop into Direct REI. The
// sheet also emails out each morning + saves to Drive.
export default async function CashBuyersPage() {
  const me = await getCurrentUser();
  if (!me || !(isManager(me) || canAccessMarketing(me) || me.position === "dispositions")) {
    return <Card className="p-10 text-center text-slate-400">💰 Cash Buyers is for dispositions + managers.</Card>;
  }
  const feed = await readBuyerFeed();

  return (
    <div className="space-y-5">
      <SectionTitle title="💰 Cash Buyers — daily sourcing" subtitle="Fresh vacant-land cash buyers & developers in our markets (TX · FL · CA · TN · OK), sourced nightly and ready for the Direct REI dialer / SMS / email." accent="bg-brand-gold" />

      {!feed ? (
        <Card className="p-8 text-center text-slate-400">No sheet yet — the first batch arrives on the next nightly run. It also emails to the team inbox and saves to Drive.</Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Card className="flex-1 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Latest sheet</div>
              <div className="text-2xl font-extrabold text-slate-800">{feed.count.toLocaleString()} <span className="text-sm font-semibold text-slate-400">new buyers · {feed.date}</span></div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.entries(feed.byState).map(([s, n]) => (
                  <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{s}: {n}</span>
                ))}
              </div>
            </Card>
            {feed.link && <a href={feed.link} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-brand-navy px-5 py-3 text-sm font-bold text-white hover:opacity-90">⬇️ Download CSV</a>}
          </div>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5">Buyer</th><th className="px-3">Phone</th><th className="px-3">Email</th><th className="px-3">Mailing</th><th className="px-3">Bought (property)</th><th className="px-3">Mkt</th>
              </tr></thead>
              <tbody>
                {feed.rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2 font-semibold text-slate-800">{r.company || `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—"}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">{r.phone || "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{r.email || "—"}</td>
                    <td className="px-3 py-2 text-[12px] text-slate-500">{[r.mailingCity, r.mailingState].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-2 text-[12px] text-slate-500">{r.propertyAddress || "—"}</td>
                    <td className="px-3 py-2 text-[11px] font-bold text-slate-500">{(r.state || r.mailingState || "").toUpperCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-center text-[11px] text-slate-400">Showing the most recent sheet (up to 500 rows). The full CSV is the download above + the emailed copy. Always scrub against DNC before dialing.</p>
        </>
      )}
    </div>
  );
}
