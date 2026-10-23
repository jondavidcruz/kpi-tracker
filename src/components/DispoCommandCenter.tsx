// ☀️ Dispo Command Center — the "run your day" board (Jon 2026-10-22). One screen
// for Marie & Sharyn: what's out needing offers, buyers due today, deals going cold,
// what's not out yet, hot replies, and the hottest buyers. Everything links back to
// the deal. Presentational — data comes from getDispoCommandData().
import Link from "next/link";
import { Card } from "@/components/ui";
import { heatTierMeta } from "@/lib/buyer-heat";
import { OFFER_GOAL } from "@/lib/dispo-offers";
import { logDispoBuyerTouchAction, runDispoCascadeAction } from "@/app/crm/actions";
import type { DispoCommand } from "@/lib/dispo-command";

function Stat({ label, value, tone }: { label: string; value: number; tone: "slate" | "red" | "amber" | "emerald" | "sky" }) {
  const cls = { slate: "text-slate-700", red: "text-rose-600", amber: "text-amber-600", emerald: "text-emerald-600", sky: "text-sky-600" }[tone];
  return (
    <div className="rounded-xl bg-white p-2.5 text-center ring-1 ring-slate-200">
      <div className={`text-2xl font-extrabold tabular-nums ${value > 0 ? cls : "text-slate-300"}`}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function Panel({ title, hint, count, children, tone = "slate" }: { title: string; hint?: string; count?: number; children: React.ReactNode; tone?: "slate" | "red" | "amber" | "sky" }) {
  const ring = { slate: "ring-slate-200", red: "ring-rose-200", amber: "ring-amber-200", sky: "ring-sky-200" }[tone];
  return (
    <Card className={`p-3 ring-1 ${ring}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">{title}</span>
        {count != null && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{count}</span>}
        {hint && <span className="ml-auto text-[10px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </Card>
  );
}

export default function DispoCommandCenter({ data }: { data: DispoCommand }) {
  const { summary: s } = data;
  const agoMin = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

  return (
    <div className="space-y-3">
      {/* summary */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        <Stat label="Out to buyers" value={s.out} tone="sky" />
        <Stat label="Need 3 offers" value={s.needOffers} tone="amber" />
        <Stat label="Due today" value={s.dueToday} tone="emerald" />
        <Stat label="Overdue" value={s.overdue} tone="red" />
        <Stat label="Going stale" value={s.aging} tone="amber" />
        <Stat label="Stuck" value={s.stuck} tone="red" />
        <Stat label="Not out yet" value={s.notOut} tone="red" />
        <Stat label="New replies" value={s.replies} tone="sky" />
      </div>

      {/* 📋 Accountability — Marie & Sharyn vs their deals */}
      {data.reps.length > 0 && (
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">📋 Accountability — who owns what</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <th className="px-2 py-1 text-left">Rep</th><th className="px-2 py-1 text-right">Deals</th><th className="px-2 py-1 text-right">Overdue</th><th className="px-2 py-1 text-right">Due today</th><th className="px-2 py-1 text-right">Need offers</th><th className="px-2 py-1 text-right">Stuck</th><th className="px-2 py-1 text-right">Stale</th>
              </tr></thead>
              <tbody>
                {data.reps.map((r) => (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-bold text-slate-800">{r.name.split(" ")[0]}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.deals}</td>
                    <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${r.overdue > 0 ? "text-rose-600" : "text-slate-300"}`}>{r.overdue}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.dueToday > 0 ? "text-emerald-600" : "text-slate-300"}`}>{r.dueToday}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.needOffers > 0 ? "text-amber-600" : "text-slate-300"}`}>{r.needOffers}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.stuck > 0 ? "text-rose-600" : "text-slate-300"}`}>{r.stuck}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${r.idle > 0 ? "text-amber-600" : "text-slate-300"}`}>{r.idle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">Red = needs action now. Each rep is accountable for clearing their overdue follow-ups and un-sticking their deals.</p>
        </div>
      )}

      {/* 📄 ready to contract — accepted offer, no draft yet — close it out */}
      {data.readyToContract.length > 0 && (
        <div className="rounded-xl bg-indigo-50 p-3 ring-1 ring-indigo-200">
          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-indigo-500">📄 Ready to contract — a buyer accepted, draft it now</div>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {data.readyToContract.map((d) => (
              <li key={d.id}><Link href={`/crm/${d.id}`} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-indigo-100 hover:bg-indigo-50">
                <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-800">{d.addr}</span>
                <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">📄 draft</span>
              </Link></li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* need offers */}
        <Panel title="🎯 Out — still chasing 3 offers" count={data.needsOffers.length} tone="amber" hint={`goal ${OFFER_GOAL}`}>
          {data.needsOffers.length === 0 ? <Empty>Every deal that's out has its 3 offers. 🎉</Empty> : (
            <ul className="space-y-1">
              {data.needsOffers.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <span className="flex items-center gap-0.5" title={`${d.liveOffers} of ${OFFER_GOAL} offers`}>
                    {Array.from({ length: OFFER_GOAL }).map((_, i) => <span key={i} className={`h-2 w-2.5 rounded-full ${i < d.liveOffers ? "bg-emerald-500" : "bg-slate-200"}`} />)}
                  </span>
                  <Link href={`/crm/${d.id}`} className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">{d.addr}</Link>
                  {d.ageDays >= 3 && <span className="shrink-0 rounded bg-amber-50 px-1 text-[9px] font-bold text-amber-600">{d.ageDays}d</span>}
                  {d.owner && <span className="shrink-0 text-[10px] text-slate-400">{d.owner.split(" ")[0]}</span>}
                  <form action={runDispoCascadeAction} className="shrink-0">
                    <input type="hidden" name="oppId" value={d.id} />
                    <button className="rounded bg-emerald-600 px-1.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-700" title="Attach more matched buyers to chase the 3rd offer">⚡ More</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* follow-ups due */}
        <Panel title="⏰ Buyer follow-ups due" count={data.followupsDue.length} tone="red">
          {data.followupsDue.length === 0 ? <Empty>No buyer follow-ups due. All caught up.</Empty> : (
            <ul className="space-y-1">
              {data.followupsDue.map((f) => (
                <li key={f.oppId + f.entryId}><Link href={`/crm/${f.oppId}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <span className="text-[11px]">{f.kind === "buyer_agent" ? "🧑‍💼" : "🏗"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-slate-800">{f.name}</span>
                    <span className="block truncate text-[10px] text-slate-400">{f.dealAddr}{f.phone ? ` · ${f.phone}` : ""}</span>
                  </span>
                  {f.overdueDays > 0
                    ? <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">{f.overdueDays}d late</span>
                    : <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">today</span>}
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>

        {/* no next step — buyers that will silently slip */}
        {data.noNextStep.length > 0 && (
          <Panel title="👻 No next step set" count={data.noNextStep.length} tone="red" hint="will slip — schedule a touch">
            <ul className="space-y-1">
              {data.noNextStep.map((f) => (
                <li key={f.oppId + f.entryId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <Link href={`/crm/${f.oppId}`} className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-slate-800">{f.name}</span>
                    <span className="block truncate text-[10px] text-slate-400">{f.dealAddr}</span>
                  </Link>
                  <form action={logDispoBuyerTouchAction} className="shrink-0">
                    <input type="hidden" name="oppId" value={f.oppId} /><input type="hidden" name="entryId" value={f.entryId} />
                    <button className="rounded bg-sky-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-sky-700" title="Log a touch + auto-set the next follow-up">📞 Touch</button>
                  </form>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* hottest buyers */}
        <Panel title="🔥 Hottest buyers" count={data.hotBuyers.length} hint="by activity + recency">
          {data.hotBuyers.length === 0 ? <Empty>No buyer activity yet — run a cascade to start the heat.</Empty> : (
            <ul className="space-y-1">
              {data.hotBuyers.map((b, i) => { const m = heatTierMeta(b.heat.tier); return (
                <li key={b.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                  <span className="w-4 text-center text-[10px] font-bold text-slate-300 tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    {b.buyerId ? <Link href={`/crm/${b.buyerId}`} className="block truncate text-[12px] font-semibold text-sky-700 hover:underline">{b.name}</Link>
                              : <span className="block truncate text-[12px] font-semibold text-slate-800">{b.name}</span>}
                    <span className="block truncate text-[10px] text-slate-400">{b.heat.reasons.slice(0, 2).join(" · ") || "on the list"}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${m.cls}`}>{m.emoji} {b.heat.score}</span>
                </li>
              ); })}
            </ul>
          )}
        </Panel>

        {/* stuck — no stage movement */}
        <Panel title="🐌 Stuck — not advancing" count={data.stuck.length} tone="red" hint="same stage 6d+">
          {data.stuck.length === 0 ? <Empty>Nothing stuck — deals are moving through stages.</Empty> : (
            <ul className="space-y-1">
              {data.stuck.map((d) => (
                <li key={d.id}><Link href={`/crm/${d.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">{d.addr}</span>
                  <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">{d.daysInStage}d in {d.stage}</span>
                  {d.owner && <span className="shrink-0 text-[10px] text-slate-400">{d.owner.split(" ")[0]}</span>}
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>

        {/* going stale */}
        <Panel title="🥶 Out but going stale" count={data.aging.length} tone="amber" hint="no movement 4d+">
          {data.aging.length === 0 ? <Empty>Nothing stale — deals are moving.</Empty> : (
            <ul className="space-y-1">
              {data.aging.map((d) => (
                <li key={d.id}><Link href={`/crm/${d.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">{d.addr}</span>
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">{d.ageDays}d cold</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{d.liveOffers}/{OFFER_GOAL}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>

        {/* not out yet */}
        <Panel title="🚨 Not out to buyers yet" count={data.notOut.length} tone="red">
          {data.notOut.length === 0 ? <Empty>Every live deal is out. Great.</Empty> : (
            <ul className="space-y-1">
              {data.notOut.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <Link href={`/crm/${d.id}`} className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800">{d.addr}</Link>
                  <span className="shrink-0 text-[10px] text-slate-400">{d.stage}</span>
                  <form action={runDispoCascadeAction} className="shrink-0">
                    <input type="hidden" name="oppId" value={d.id} />
                    <button className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-700" title="Attach the top matched buyers + start the follow-up">⚡ Cascade</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* hot replies */}
        <Panel title="💬 New buyer replies" count={data.hotReplies.length} tone="sky" hint="last 3 days">
          {data.hotReplies.length === 0 ? <Empty>No new inbound replies.</Empty> : (
            <ul className="space-y-1">
              {data.hotReplies.map((r, i) => (
                <li key={r.oppId + i}><Link href={`/crm/${r.oppId}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <span className="text-[11px]">{r.channel === "email" ? "✉️" : "💬"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-slate-700">{r.snippet || "(reply)"}</span>
                    <span className="block truncate text-[10px] text-slate-400">{r.addr}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400">{agoMin(r.atIso)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-3 text-center text-[11px] text-slate-400">{children}</p>;
}
