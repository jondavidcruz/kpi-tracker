"use client";
// 🧾 The standard 10-question developer buy-box interview, as a single reusable
// form (Jon 2026-10-20). Used two places now: on each VETTED developer (/marketing
// demand board) AND on each UNVETTED prospect during vetting (/vetting) — so the
// girls ask the SAME questions while vetting and it fills the buy-box in. Answers
// save to the shared BuyerLand store (saveBuyerLand).
import { saveBuyerLand } from "@/app/actions";
import {
  type BuyerLand, BUILDER_TYPES, LAND_TYPES, UTILITY_OPTS, ZONING_OPTS, CLOSE_OPTS,
  effectiveLand, interviewScore, type CrmSeed,
} from "@/lib/buyer-land";
import { LAND_FEATURES } from "@/lib/crm-forms";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";
const qCls = "text-[12px] font-extrabold uppercase tracking-wide text-emerald-700";

export default function DevInterviewForm({ buyerId, seed, saved }: { buyerId: string; seed: CrmSeed; saved: BuyerLand | undefined }) {
  const l = effectiveLand(saved ?? {}, seed);
  const score = interviewScore(saved ?? {});
  return (
    <form action={saveBuyerLand} className="space-y-4 rounded-xl bg-emerald-50/40 p-3.5 ring-1 ring-emerald-100">
      <input type="hidden" name="buyerId" value={buyerId} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-emerald-700">🧾 Ask these 10 while you vet — it fills the buy-box</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${score.done === score.total ? "bg-emerald-600 text-white" : score.done >= 6 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{score.done === score.total ? "✓ complete" : `${score.done}/${score.total} answered`}</span>
      </div>

      {/* Q1 — WHERE (the goldmine) */}
      <div>
        <div className={qCls}>1 · Where do you buy land? <span className="font-normal normal-case text-slate-400">— counties are the goldmine; get specific</span></div>
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <label><span className={labCls}>States</span><input name="buyStates" defaultValue={l.buyStates ?? ""} placeholder="TN, TX" className={inputCls} /></label>
          <label><span className={labCls}>Counties (one per line)</span><textarea name="buyCounties" rows={3} defaultValue={l.buyCounties ?? ""} placeholder={"Davidson, TN\nWilliamson, TN"} className={inputCls} /></label>
          <label><span className={labCls}>Cities / areas (one per line)</span><textarea name="buyCities" rows={3} defaultValue={l.buyCities ?? ""} placeholder={"Nashville\nAntioch"} className={inputCls} /></label>
          <label><span className={labCls}>Target ZIPs</span><textarea name="targetZips" rows={3} defaultValue={l.targetZips ?? ""} placeholder="37013, 37115" className={inputCls} /></label>
        </div>
      </div>

      {/* Q2 — land types */}
      <div>
        <div className={qCls}>2 · What types of land?</div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {LAND_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-[13px] text-slate-700">
              <input type="checkbox" name="landTypes" value={t} defaultChecked={(l.landTypes ?? "").includes(t)} className="h-4 w-4" /> {t}
            </label>
          ))}
        </div>
      </div>

      {/* Features they want — matched to a lead's Land features */}
      <div>
        <div className={qCls}>2b · Land features they want (matches seller leads)</div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {LAND_FEATURES.map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-[13px] text-slate-700">
              <input type="checkbox" name="featuresWanted" value={t} defaultChecked={(l.featuresWanted ?? "").includes(t)} className="h-4 w-4" /> {t}
            </label>
          ))}
        </div>
      </div>

      {/* Q3–Q5 — size + money */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <label><span className={labCls}>3 · Lot size MIN (acres)</span><input name="lotMin" type="number" step="any" defaultValue={l.lotMin ?? ""} placeholder="0.25" className={inputCls} /></label>
        <label><span className={labCls}>Lot size MAX (acres)</span><input name="lotMax" type="number" step="any" defaultValue={l.lotMax ?? ""} placeholder="5" className={inputCls} /></label>
        <label className="col-span-2"><span className={labCls}>4 · How many acres are you looking for?</span><input name="acresTypical" defaultValue={l.acresTypical ?? ""} placeholder="e.g. 40–100 ac for next phase" className={inputCls} /></label>
        <label><span className={labCls}>5 · Price MIN per deal</span><input name="priceMin" type="number" defaultValue={l.priceMin ?? ""} placeholder="$50,000" className={inputCls} /></label>
        <label><span className={labCls}>Price MAX per deal</span><input name="priceMax" type="number" defaultValue={l.priceMax ?? ""} placeholder="$500,000" className={inputCls} /></label>
      </div>

      {/* Q6–Q8 — speed + requirements */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <label><span className={labCls}>6 · How fast can you close?</span>
          <select name="closeSpeed" defaultValue={l.closeSpeed ?? ""} className={inputCls}><option value="">—</option>{CLOSE_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
        </label>
        <label><span className={labCls}>7 · Utilities requirement</span>
          <select name="utilities" defaultValue={l.utilities ?? (l.utilitiesRequired ? UTILITY_OPTS[0] : "")} className={inputCls}><option value="">—</option>{UTILITY_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
        </label>
        <label><span className={labCls}>8 · Zoning / entitlement</span>
          <select name="zoningPref" defaultValue={l.zoningPref ?? ""} className={inputCls}><option value="">—</option>{ZONING_OPTS.map((o) => <option key={o}>{o}</option>)}</select>
        </label>
        <label><span className={labCls}>$ per finished/paper lot</span><input name="pricePerLot" type="number" defaultValue={l.pricePerLot ?? ""} placeholder="$" className={inputCls} /></label>
      </div>

      {/* Q9–Q10 — volume + deal breakers */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <label><span className={labCls}>9 · Lots / deals per year</span><input name="lotsPerYear" type="number" defaultValue={l.lotsPerYear ?? ""} placeholder="12" className={inputCls} /></label>
        <label><span className={labCls}>Permits last 12 mo</span><input name="permits12mo" type="number" defaultValue={l.permits12mo ?? ""} className={inputCls} /></label>
        <label><span className={labCls}>Builder type</span>
          <select name="builderType" defaultValue={l.builderType ?? ""} className={inputCls}>{BUILDER_TYPES.map((b) => <option key={b} value={b}>{b || "—"}</option>)}</select>
        </label>
        <label className="col-span-2 sm:col-span-3"><span className={labCls}>10 · Deal breakers</span><input name="dealBreakers" defaultValue={l.dealBreakers ?? ""} placeholder="wetlands, HOA, no legal access, power lines…" className={inputCls} /></label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[13px] text-slate-700"><input type="checkbox" name="isLandBuyer" defaultChecked={!!l.isLandBuyer} className="h-4 w-4" /> 🌱 Active land buyer (boosts them in the deal cascade)</label>
        <input name="notes" defaultValue={l.notes ?? ""} placeholder="anything else from the call…" className={`${inputCls} min-w-56 flex-1`} />
        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Save interview</button>
      </div>
    </form>
  );
}
