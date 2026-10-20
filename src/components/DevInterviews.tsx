import Link from "next/link";
import { Card } from "@/components/ui";
import DevInterviewForm from "@/components/DevInterviewForm";
import {
  type BuyerLand, CLOSE_OPTS, interviewScore, demandAreas, effectiveLand, type CrmSeed,
} from "@/lib/buyer-land";

// The STANDARD developer interview (Jon 2026-09-21): every developer gets the
// same 10 questions, in the same order, so the team can compare buy-boxes and
// reverse-engineer WHERE developers buy → pull seller leads exactly there.
export default function DevInterviews({
  rows,
  land,
}: {
  rows: ({ id: string; name: string; company: string } & CrmSeed)[];
  land: Record<string, BuyerLand>;
}) {
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? "";
  const idOf = (name: string) => rows.find((r) => r.name === name)?.id ?? "";
  const demand = demandAreas(land, nameOf);

  // Who buys alongside whom — developers sharing at least one interviewed area.
  const overlap = new Map<string, Set<string>>();
  for (const d of demand) {
    if (d.devs.length < 2) continue;
    for (const a of d.devs) for (const b of d.devs) {
      if (a === b) continue;
      (overlap.get(a) ?? overlap.set(a, new Set()).get(a)!).add(b);
    }
  }

  // Pull plans — for each area 2+ developers want, combine their interviews into
  // the exact list-pull criteria: price band, lot band, land types, close speed.
  const money = (n: number) => `$${n.toLocaleString()}`;
  const pullPlans = demand.filter((d) => d.devs.length >= 2).slice(0, 6).map((d) => {
    const lands = d.devs.map((n) => land[idOf(n)]).filter(Boolean) as BuyerLand[];
    const mins = lands.flatMap((l) => [l.priceMin, l.pricePerLot].filter((x): x is number => !!x));
    const maxs = lands.flatMap((l) => [l.priceMax, l.pricePerLot].filter((x): x is number => !!x));
    const lotMins = lands.map((l) => l.lotMin).filter((x): x is number => !!x);
    const lotMaxs = lands.map((l) => l.lotMax).filter((x): x is number => !!x);
    const types = [...new Set(lands.flatMap((l) => (l.landTypes ?? "").split(",").map((s) => s.trim()).filter(Boolean)))];
    const speedIdx = lands.map((l) => CLOSE_OPTS.indexOf(l.closeSpeed ?? "")).filter((i) => i >= 0);
    return {
      area: d.area, devs: d.devs,
      price: mins.length || maxs.length ? `${mins.length ? money(Math.min(...mins)) : "?"} – ${maxs.length ? money(Math.max(...maxs)) : "?"}` : null,
      lots: lotMins.length || lotMaxs.length ? `${lotMins.length ? Math.min(...lotMins) : "?"}–${lotMaxs.length ? Math.max(...lotMaxs) : "?"} ac` : null,
      types: types.slice(0, 4),
      speed: speedIdx.length ? CLOSE_OPTS[Math.min(...speedIdx)] : null,
    };
  });

  return (
    <>
      {/* ── The reverse-engineering payoff: ranked demand board ── */}
      <Card className="border-l-4 border-brand-gold p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-slate-800">📍 Where our developers buy — demand board</h2>
          <span className="text-[11px] text-slate-400">built live from the interviews below</span>
          <Link href="/lead-sourcing" className="ml-auto rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy-700">→ Pull seller leads in these areas</Link>
        </div>
        <p className="mt-0.5 text-[12px] text-slate-500">Every county, city, and ZIP captured in an interview lands here, ranked by how many developers want it. The top of this list is where we market to land sellers next.</p>
        {demand.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Nothing yet — run the interviews below and every area you capture shows up here automatically.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {demand.slice(0, 40).map((d) => (
              <span
                key={d.area}
                title={d.devs.join(", ")}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                  d.devs.length >= 3 ? "bg-emerald-600 text-white ring-transparent" : d.devs.length === 2 ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-white text-slate-600 ring-slate-200"
                }`}
              >
                {d.area} · {d.devs.length} dev{d.devs.length === 1 ? "" : "s"}
              </span>
            ))}
          </div>
        )}
        {demand.length > 0 && <p className="mt-2 text-[11px] text-slate-400">Hover a chip to see which developers buy there. Dark green = 3+ developers competing for the same dirt — pull lists there first.</p>}

        {/* Ready-made pull plans for the hottest overlaps */}
        {pullPlans.length > 0 && (
          <div className="mt-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">🎯 Pull plans — the exact list criteria for each hot area</div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {pullPlans.map((p) => (
                <div key={p.area} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-slate-800">{p.area}</span>
                    <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{p.devs.length} buyers</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-[12px] text-slate-600">
                    {p.price && <div>💵 They pay <b className="text-emerald-700">{p.price}</b></div>}
                    {p.lots && <div>📏 Pull parcels <b>{p.lots}</b></div>}
                    {p.types.length > 0 && <div>🌲 {p.types.join(" · ")}</div>}
                    {p.speed && <div>⚡ Fastest close: {p.speed}</div>}
                    <div className="text-[11px] text-slate-400">Sell to: {p.devs.join(", ")}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── The standard interview, one per developer ── */}
      <Card id="interviews" className="scroll-mt-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-slate-800">🧾 Developer buy-box interviews</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{rows.length} developers</span>
        </div>
        <p className="mt-0.5 text-[12px] text-slate-500">
          Same 10 questions for every developer — ask them in this order on the call and fill as you go. The score shows what&apos;s still unanswered for the next touch.
        </p>
        <div className="mt-3 divide-y divide-slate-100">
          {rows.length === 0 && <p className="py-2 text-sm text-slate-400">No vetted developers yet — vet them in Buyer Research first.</p>}
          {rows.map((r) => {
            const saved = land[r.id] ?? {};
            // What the form shows: saved answers first, gaps pre-filled from the
            // ⊕ buy-box CRM fields (price range, close speed, deal type, lot size,
            // areas). One "Save interview" locks the pre-fills into the store.
            const l = effectiveLand(saved, r);
            const score = interviewScore(saved);
            const seeded = interviewScore(l).done - score.done;
            const full = score.done === score.total;
            const buddies = [...(overlap.get(r.name) ?? [])].slice(0, 3);
            const whereCount =
              (l.buyCounties ?? "").split(/[\n;]+/).filter((s) => s.trim()).length +
              (l.buyCities ?? "").split(/[\n,;]+/).filter((s) => s.trim()).length;
            const price =
              l.priceMin || l.priceMax
                ? `$${(l.priceMin ?? 0).toLocaleString()}–$${(l.priceMax ?? 0).toLocaleString()}`
                : l.pricePerLot ? `$${l.pricePerLot.toLocaleString()}/lot` : "";
            return (
              <details key={r.id} className="py-2">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-800">{r.name}</span>
                  {r.company && <span className="text-[11px] text-slate-400">{r.company}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${full ? "bg-emerald-600 text-white" : score.done >= 6 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                    {full ? "✓ complete" : `${score.done}/${score.total} answered`}
                  </span>
                  {seeded > 0 && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700" title="Answers pulled from the ⊕ buy-box panel — open and hit Save interview to lock them in">＋{seeded} pre-filled — save to lock in</span>}
                  {whereCount > 0 && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">📍 {whereCount} area{whereCount === 1 ? "" : "s"}</span>}
                  {price && <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">{price}</span>}
                  {l.closeSpeed && <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">⚡ {l.closeSpeed}</span>}
                  {buddies.length > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200" title="Developers buying in the same areas">🤝 {buddies.join(", ")}</span>}
                </summary>

                <div className="mt-3">
                  <DevInterviewForm buyerId={r.id} seed={r} saved={saved} />
                </div>
              </details>
            );
          })}
        </div>
      </Card>
    </>
  );
}
