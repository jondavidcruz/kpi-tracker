import Link from "next/link";
import { getCurrentUser, canAccessMarketing } from "@/lib/auth";
import { getActiveDeals } from "@/lib/data";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// Builder/developer buyer types (vs flippers/cash buyers/agents) — these are the
// people who buy lots & teardowns and are the #1 dispo bottleneck to source for.
const DEV_TYPES = new Set(["developer", "custom", "remodeler", "builder"]);

const STATUS_PILL: Record<string, string> = {
  to_contact: "bg-red-100 text-red-700",
  contacted: "bg-sky-100 text-sky-700",
  messaged: "bg-indigo-100 text-indigo-700",
  following_up: "bg-amber-100 text-amber-700",
};
const STATUS_LABEL: Record<string, string> = {
  to_contact: "To contact",
  contacted: "Contacted",
  messaged: "Messaged",
  following_up: "Following up",
};

// Same area-token match the Deals board uses: does this buyer's buy-box area or
// market appear in the deal address?
function areaMatch(address: string, buyBoxAreas: string, market: string): boolean {
  const a = (address || "").toLowerCase();
  if (!a) return false;
  return `${buyBoxAreas || ""},${market || ""}`
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3)
    .some((t) => a.includes(t));
}

export default async function DeveloperOutreachPage() {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">No access</h1>
        <p className="mt-1 text-sm text-slate-500">Developer Outreach is for the marketing/dispositions team.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const [rows, deals] = await Promise.all([
    db.marketContact.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    getActiveDeals(),
  ]);
  const devs = rows.filter((r) => DEV_TYPES.has((r.type || "").toLowerCase()));

  // Matched active deals per developer (by buy-box area).
  const matchedDeals = (d: (typeof devs)[number]) => deals.filter((deal) => areaMatch(deal.address, d.buyBoxAreas, d.market));

  // Stats.
  const total = devs.length;
  const toContact = devs.filter((d) => d.vetStatus === "to_contact").length;
  const contacted = devs.filter((d) => d.vetStatus === "contacted" || d.vetStatus === "messaged").length;
  const following = devs.filter((d) => d.vetStatus === "following_up").length;
  const withMatch = devs.filter((d) => matchedDeals(d).length > 0).length;

  // Active deals that have at least one matching developer (deal-sourcing view).
  const dealMatches = deals
    .map((deal) => ({ deal, devs: devs.filter((d) => areaMatch(deal.address, d.buyBoxAreas, d.market)) }))
    .filter((x) => x.devs.length > 0);

  const Stat = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
    <div className={`rounded-xl px-4 py-3 ${tone}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );

  const contactBits = (d: (typeof devs)[number]) =>
    [d.bestContact, d.phone, d.email, d.igHandle && `@${d.igHandle}`].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">🏗 Developer Outreach</h1>
        <p className="mt-1 text-sm text-slate-500">
          Source and work the builders/developers who buy your lots & teardowns — the #1 dispositions bottleneck.
          Pulled live from <Link href="/vetting" className="underline">Buyer Research</Link>; this view isolates developer-type buyers and shows which ones match each active deal.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Developers" value={total} tone="bg-slate-100 text-slate-800" />
        <Stat label="To contact" value={toContact} tone="bg-red-50 text-red-700" />
        <Stat label="Contacted" value={contacted} tone="bg-sky-50 text-sky-700" />
        <Stat label="Following up" value={following} tone="bg-amber-50 text-amber-700" />
        <Stat label="Match a deal" value={withMatch} tone="bg-emerald-50 text-emerald-700" />
      </div>

      {/* Active Deal Sourcing — for each live deal, who can buy it */}
      <Card className="p-5">
        <SectionTitle title="🎯 Active Deal Sourcing" />
        <p className="mb-3 text-xs text-slate-500">Developers whose buy-box area matches a property you have under contract right now — call these first.</p>
        {dealMatches.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
            No active deals match a developer&apos;s buy-box area yet. Add buy-box areas to developers in Buyer Research, or this fills in as new deals come under contract.
          </p>
        ) : (
          <div className="space-y-3">
            {dealMatches.map(({ deal, devs: matched }) => (
              <div key={deal.id} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-800">{deal.address || "(no address)"}</div>
                  <Link href={`/deals`} className="text-xs text-slate-400 underline">view deal</Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  {matched.map((d) => (
                    <span key={d.id} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 ring-1 ring-emerald-200">
                      <b>{d.name}</b>{d.company ? ` · ${d.company}` : ""}
                      {d.bestContact || d.phone ? <span className="opacity-70">— {d.bestContact || d.phone}</span> : null}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Developer Directory */}
      <Card className="p-5">
        <SectionTitle title="📇 Developer Directory" />
        {devs.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
            No developer-type buyers yet. In <Link href="/vetting" className="underline">Buyer Research</Link>, set a buyer&apos;s <b>type</b> to &quot;developer&quot;, &quot;custom&quot;, or &quot;remodeler&quot; and they&apos;ll show here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Developer</th>
                  <th className="px-3 py-2 font-semibold">Buy box / areas</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Last touch</th>
                  <th className="px-3 py-2 font-semibold">Next follow-up</th>
                  <th className="px-3 py-2 text-right font-semibold">Deals</th>
                </tr>
              </thead>
              <tbody>
                {devs.map((d) => {
                  const m = matchedDeals(d).length;
                  return (
                    <tr key={d.id} className="border-b border-slate-100 align-top">
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-800">{d.name}{d.company ? <span className="font-normal text-slate-400"> · {d.company}</span> : null}</div>
                        <div className="text-[11px] text-slate-400">{contactBits(d) || "—"}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        <div>{[d.priceRange, d.buildType, d.dealType].filter(Boolean).join(" · ") || d.buyBox || "—"}</div>
                        {d.buyBoxAreas ? <div className="text-[11px] text-slate-400">{d.buyBoxAreas.replace(/\n/g, ", ")}</div> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[d.vetStatus] || "bg-slate-100 text-slate-600"}`}>
                          {STATUS_LABEL[d.vetStatus] || d.vetStatus || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{d.lastContacted || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-500">{d.nextFollowUp || "—"}</td>
                      <td className="px-3 py-2.5 text-right">{m > 0 ? <span className="font-semibold text-emerald-700">{m}</span> : <span className="text-slate-300">0</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-center text-[11px] text-slate-400">
        Read-only for now. Next up (pending your OK): log outreach in one click + auto-track Developers Sourced / Contacted as dispo KPIs.
      </p>
    </div>
  );
}
