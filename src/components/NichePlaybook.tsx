"use client";
// 🎯 Niche Playbook (Jon 2026-11-09) — "sell the use, not the dirt."
// The strategy brain for picking which land niche to attack: a ranked do-first scorecard plus an
// expandable playbook per niche (buyer archetypes, buy-box template, spread band, leading
// indicator, where to look). Pure read of src/lib/land-niches.ts — no DB, no writes.
import { useState } from "react";
import { rankedNiches, BUYER_ARCHETYPES, SPREAD_TIER_LABEL, archetype, type Scores } from "@/lib/land-niches";
import { nicheMarket, type HuntArea, type NicheMarket } from "@/lib/niche-markets";

const DIMS: { key: keyof Scores; label: string }[] = [
  { key: "startSpeed", label: "Start speed" },
  { key: "buyerAccess", label: "Buyer access" },
  { key: "spread", label: "Spread" },
  { key: "simplicity", label: "Simplicity" },
  { key: "studyValue", label: "Study value" },
];

function Dots({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" title={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n ? "bg-emerald-500" : "bg-slate-200"}`} />
      ))}
    </span>
  );
}

type NicheMatch = { id: string; name: string; manual: boolean };

const TIER_STYLE: Record<HuntArea["tier"], { ring: string; bg: string; text: string; label: string }> = {
  primary: { ring: "ring-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700", label: "GO" },
  secondary: { ring: "ring-violet-200", bg: "bg-violet-50", text: "text-violet-700", label: "HIGH-$" },
  watch: { ring: "ring-amber-200", bg: "bg-amber-50", text: "text-amber-700", label: "WATCH" },
};

// 🔭 Per-niche market intel — the sniper-research brain: where to hunt in FL, the pull filter,
// signals to watch, buyers, spread. Only shows for niches we've researched (waterfront/solar/DC).
function NicheResearch({ m }: { m: NicheMarket }) {
  const byTier = (t: HuntArea["tier"]) => m.areas.filter((a) => a.tier === t);
  const order: HuntArea["tier"][] = ["primary", "secondary", "watch"];
  return (
    <div className="space-y-3 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-slate-100">
      <div className="flex items-center gap-2">
        <span className="text-sm font-extrabold">🔭 Florida market intel</span>
        <span className="text-[10px] text-slate-400">sniper research · updated {m.updated}</span>
      </div>
      <p className="text-[12px] leading-relaxed text-slate-200">{m.thesis}</p>
      <div className="rounded-lg bg-emerald-500/10 p-2.5 ring-1 ring-emerald-500/20">
        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-300">💰 The spread</span>
        <p className="mt-0.5 text-[12px] text-slate-200">{m.economics}</p>
      </div>

      {/* where to hunt */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">🎯 Where to hunt in Florida</div>
        <div className="mt-1.5 space-y-1.5">
          {order.flatMap((t) => byTier(t)).map((a) => {
            const st = TIER_STYLE[a.tier];
            return (
              <div key={a.area} className="rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold ${st.bg} ${st.text}`}>{st.label}</span>
                  <span className="text-[12px] font-bold text-white">{a.area}</span>
                  {a.badge && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-slate-200">{a.badge}</span>}
                  {a.water && <span className="text-[10px] text-sky-300">{a.water}</span>}
                  {a.priceBand && <span className="ml-auto text-[11px] font-bold text-emerald-300">{a.priceBand}</span>}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-300">{a.why}</p>
              </div>
            );
          })}
        </div>
      </div>

      {m.avoid && m.avoid.length > 0 && (
        <div className="rounded-lg bg-red-500/10 p-2.5 ring-1 ring-red-500/20">
          <span className="text-[10px] font-bold uppercase tracking-wide text-red-300">⛔ Skip these (penny-lot / wrong fit)</span>
          <ul className="mt-1 space-y-0.5">
            {m.avoid.map((a) => <li key={a} className="text-[11px] text-slate-300">• {a}</li>)}
          </ul>
        </div>
      )}

      {/* sniper pull filter */}
      <div className="rounded-lg bg-blue-500/10 p-2.5 ring-1 ring-blue-500/20">
        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-300">🔫 Sniper pull filter</span>
        <ul className="mt-1 space-y-1">
          {m.pullFilter.map((f, i) => <li key={i} className="text-[11px] text-slate-200">{i + 1}. {f}</li>)}
        </ul>
      </div>

      {/* signals + buyers */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-300">📡 Signals to watch</div>
          <ul className="mt-1 space-y-1">
            {m.signals.map((s, i) => (
              <li key={i} className="text-[11px] text-slate-300">
                • {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline hover:text-sky-200">{s.label}</a> : s.label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-300">👤 Buyers to marry deals to</div>
          <ul className="mt-1 space-y-1">
            {m.buyers.map((b, i) => <li key={i} className="text-[11px] text-slate-300">• {b}</li>)}
          </ul>
        </div>
      </div>

      {m.caveat && <p className="text-[10px] italic text-slate-400">⚠️ {m.caveat}</p>}
    </div>
  );
}

export default function NichePlaybook({ matches = {} }: { matches?: Record<string, NicheMatch[]> }) {
  const ranked = rankedNiches();
  const [open, setOpen] = useState<string | null>(ranked[0]?.id ?? null);
  const [showBuyers, setShowBuyers] = useState(false);

  return (
    <div className="space-y-5">
      {/* The principle */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm ring-1 ring-emerald-100">
        <div className="text-sm font-extrabold text-slate-800">Sell the use, not the dirt</div>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
          Infill lots are a commodity — thin spread, max competition. Real spread lives in <b>scarcity</b> (waterfront,
          path-of-growth, power-adjacent), <b>hidden complexity</b> (split / rezone / entitle the seller can&apos;t see),
          or a <b>buyer who values the land for a use the comps don&apos;t reflect</b> (storage, solar, MH, data center).
          Pick the niche, then marry the parcel to the buyer who pays for that outcome.
        </p>
      </div>

      {/* Ranked do-first scorecard */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="text-sm font-extrabold text-slate-800">🏁 Do-first scorecard</span>
          <span className="text-[11px] text-slate-400">ranked by spread × buyer access × start speed × simplicity</span>
        </div>
        <div className="divide-y divide-slate-100">
          {ranked.map((n, i) => (
            <div key={n.id}>
              <button
                onClick={() => setOpen(open === n.id ? null : n.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${open === n.id ? "bg-slate-50" : ""}`}
              >
                <span className="w-5 shrink-0 text-center text-[11px] font-bold text-slate-400">{i + 1}</span>
                <span className="text-lg">{n.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-slate-800">{n.label}</span>
                    {n.commodity && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">baseline</span>}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">{n.tagline}</span>
                </span>
                {nicheMarket(n.id) && (
                  <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-sky-300" title="Deep Florida market intel available">🔭 intel</span>
                )}
                {(matches[n.id]?.length ?? 0) > 0 && (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200" title="Vetted buyers who fit this niche">
                    👥 {matches[n.id].length}
                  </span>
                )}
                <span className="hidden shrink-0 text-[11px] font-semibold text-slate-500 sm:block">{SPREAD_TIER_LABEL[n.spreadTier]}</span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-extrabold text-emerald-600">{n.score}</span>
                  <span className="block text-[9px] uppercase tracking-wide text-slate-400">do-first</span>
                </span>
                <span className="shrink-0 text-slate-300">{open === n.id ? "▲" : "▼"}</span>
              </button>

              {open === n.id && (
                <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                  {/* scores */}
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {DIMS.map((d) => (
                      <span key={d.key} className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-500">{d.label}</span>
                        <Dots n={n.scores[d.key]} />
                      </span>
                    ))}
                  </div>

                  {/* 🔭 Florida market intel — the sniper research (only for researched niches) */}
                  {nicheMarket(n.id) && <NicheResearch m={nicheMarket(n.id)!} />}

                  {/* spread */}
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Spread</span>
                      <span className="text-sm font-extrabold text-slate-800">{n.spreadRange}</span>
                      <span className="text-[11px] font-semibold text-slate-500">· {SPREAD_TIER_LABEL[n.spreadTier]}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-600">{n.spreadWhy}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* buy box */}
                    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Parcel buy-box</div>
                      <ul className="mt-1.5 space-y-1">
                        {n.buyBox.map((b) => (
                          <li key={b.field} className="text-[12px] text-slate-600">
                            <span className="font-semibold text-slate-700">{b.field}:</span> {b.example}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* buyers */}
                    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Marry it to</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {n.buyerTypes.map((id) => {
                          const a = archetype(id);
                          if (!a) return null;
                          return (
                            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-navy/5 px-2 py-1 text-[11px] font-semibold text-brand-navy ring-1 ring-brand-navy/10" title={`${a.who} · reach via ${a.reachVia}`}>
                              <span>{a.emoji}</span>{a.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* leading indicator + where to look */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white p-3 ring-1 ring-amber-200">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-amber-500">📈 Leading indicator</div>
                      <p className="mt-1 text-[12px] text-slate-600">{n.leadingIndicator}</p>
                    </div>
                    <div className="rounded-xl bg-white p-3 ring-1 ring-blue-200">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-blue-500">🔎 Where to look</div>
                      <p className="mt-1 text-[12px] text-slate-600">{n.whereToLook}</p>
                    </div>
                  </div>

                  {n.note && <p className="text-[12px] italic text-slate-500">💡 {n.note}</p>}

                  {/* matched vetted buyers (manual tag wins, else auto-suggested from their buy-box) */}
                  {(matches[n.id]?.length ?? 0) > 0 && (
                    <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-200">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">👥 Vetted buyers who fit ({matches[n.id].length})</div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {matches[n.id].map((b) => (
                          <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200" title={b.manual ? "Manually tagged" : "Auto-matched from their buy-box"}>
                            {b.name}{b.manual ? " 📌" : ""}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10px] text-slate-400">📌 = manually tagged · others auto-matched from their buy-box text</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Buyer archetype reference */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <button onClick={() => setShowBuyers((s) => !s)} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-slate-50">
          <span className="text-sm font-extrabold text-slate-800">👥 Buyer archetypes &amp; their buy-boxes</span>
          <span className="ml-auto text-[11px] font-semibold text-slate-400">{showBuyers ? "Hide ▲" : "Show ▼"}</span>
        </button>
        {showBuyers && (
          <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">
            {BUYER_ARCHETYPES.map((a) => (
              <div key={a.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-base">{a.emoji}</span>
                  <span className="text-[13px] font-bold text-slate-800">{a.label}</span>
                </div>
                <p className="mt-1 text-[12px] text-slate-600">{a.who}</p>
                <p className="mt-1 text-[11px] text-slate-500"><span className="font-semibold">Reach via:</span> {a.reachVia}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {a.buyBoxCares.map((c) => (
                    <span key={c} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">{c}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
