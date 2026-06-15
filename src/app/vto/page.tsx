import Link from "next/link";
import { saveVto } from "@/app/actions";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getVto } from "@/lib/data";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

function lines(s: string): string[] {
  return s.split("\n").map((x) => x.trim()).filter(Boolean);
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-navy-300">{title}</h3>
      {children}
    </Card>
  );
}

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm italic text-slate-300">{empty}</p>;
  return <ul className="space-y-1">{items.map((t, i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><span className="text-brand-gold">•</span>{t}</li>)}</ul>;
}

function Val({ v, empty }: { v: string; empty: string }) {
  return v ? <p className="whitespace-pre-wrap text-sm text-slate-700">{v}</p> : <p className="text-sm italic text-slate-300">{empty}</p>;
}

export default async function VtoPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const sp = await searchParams;
  const owner = isAdmin(me);
  const v = await getVto();

  return (
    <div className="space-y-6">
      <SectionTitle
        title="🧭 Vision / Traction Organizer"
        subtitle="Where we're going and how we'll get there — the one page the whole team rallies behind."
        accent="bg-brand-gold"
        right={owner ? <a href="#edit" className="text-sm font-semibold text-brand-navy hover:underline">Edit ↓</a> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Read-only</span>}
      />
      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Vision saved.</div>}

      {/* VISION */}
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-gold-soft">— Vision —</div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block title="Core Values"><Bullets items={lines(v.coreValues)} empty="The handful of behaviors we hire, fire, and reward by." /></Block>
        <Block title="Core Focus">
          <div className="space-y-2">
            <div><div className="text-[11px] font-semibold text-slate-400">Purpose / Cause / Passion</div><Val v={v.purpose} empty="Why we exist." /></div>
            <div><div className="text-[11px] font-semibold text-slate-400">Our Niche</div><Val v={v.niche} empty="What we do best." /></div>
          </div>
        </Block>
        <Block title="10-Year Target"><Val v={v.tenYearTarget} empty="The big long-range goal everything points at." /></Block>
        <Block title="Marketing Strategy">
          <div className="space-y-2">
            <div><div className="text-[11px] font-semibold text-slate-400">Target Market ("The List")</div><Val v={v.targetMarket} empty="Who our ideal seller / buyer is." /></div>
            <div><div className="text-[11px] font-semibold text-slate-400">The 3 Uniques</div><Bullets items={lines(v.uniques)} empty="What sets us apart." /></div>
            <div><div className="text-[11px] font-semibold text-slate-400">Proven Process</div><Val v={v.provenProcess} empty="How we deliver, every time." /></div>
            <div><div className="text-[11px] font-semibold text-slate-400">Guarantee</div><Val v={v.guarantee} empty="The promise we stand behind." /></div>
          </div>
        </Block>
        <Block title="3-Year Picture">
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            {v.threeYrDate && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{v.threeYrDate}</span>}
            {v.threeYrRevenue && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Rev {v.threeYrRevenue}</span>}
            {v.threeYrProfit && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">Profit {v.threeYrProfit}</span>}
          </div>
          {lines(v.threeYrMeasurables).length > 0 && <div className="mb-2"><div className="text-[11px] font-semibold text-slate-400">Measurables</div><Bullets items={lines(v.threeYrMeasurables)} empty="" /></div>}
          <div className="text-[11px] font-semibold text-slate-400">What it looks like</div>
          <Bullets items={lines(v.threeYrPicture)} empty="Paint the picture of the business 3 years out." />
        </Block>
        <Block title="1-Year Plan">
          <div className="mb-2 flex flex-wrap gap-2 text-xs">
            {v.oneYrDate && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{v.oneYrDate}</span>}
            {v.oneYrRevenue && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Rev {v.oneYrRevenue}</span>}
            {v.oneYrProfit && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">Profit {v.oneYrProfit}</span>}
          </div>
          {lines(v.oneYrMeasurables).length > 0 && <div className="mb-2"><div className="text-[11px] font-semibold text-slate-400">Measurables</div><Bullets items={lines(v.oneYrMeasurables)} empty="" /></div>}
          <div className="text-[11px] font-semibold text-slate-400">Goals for the year</div>
          <Bullets items={lines(v.oneYrGoals)} empty="The 3-7 goals that define a winning year." />
        </Block>
      </div>

      {/* TRACTION */}
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-gold-soft">— Traction —</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/rocks"><Card className="p-5 transition hover:ring-2 hover:ring-brand-gold/40"><div className="flex items-center gap-3"><span className="text-2xl">🪨</span><div><div className="font-bold text-slate-800">Quarterly Rocks</div><div className="text-xs text-slate-500">The 3-7 priorities for this quarter →</div></div></div></Card></Link>
        <Link href="/issues"><Card className="p-5 transition hover:ring-2 hover:ring-brand-gold/40"><div className="flex items-center gap-3"><span className="text-2xl">🚧</span><div><div className="font-bold text-slate-800">Issues List</div><div className="text-xs text-slate-500">Everything to identify, discuss & solve →</div></div></div></Card></Link>
      </div>

      {/* EDIT (owner only) */}
      {owner && (
        <div id="edit" className="scroll-mt-4 border-t border-slate-200 pt-6">
          <SectionTitle title="✏️ Edit the V/TO" subtitle="Only you can edit this. The team sees the read-only view above." accent="bg-slate-300" />
          <Card className="p-6">
            <form action={saveVto} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className={labelCls}>Core Values (one per line)</span><textarea name="coreValues" defaultValue={v.coreValues} rows={5} placeholder={"Do the right thing\nOwn the outcome\nServe the homeowner"} className={inputCls} /></label>
              <label><span className={labelCls}>Core Focus — Purpose / Cause / Passion</span><textarea name="purpose" defaultValue={v.purpose} rows={2} className={inputCls} /></label>
              <label><span className={labelCls}>Core Focus — Niche</span><textarea name="niche" defaultValue={v.niche} rows={2} className={inputCls} /></label>
              <label className="sm:col-span-2"><span className={labelCls}>10-Year Target</span><input name="tenYearTarget" defaultValue={v.tenYearTarget} className={inputCls} /></label>
              <label className="sm:col-span-2"><span className={labelCls}>Marketing — Target Market / "The List"</span><textarea name="targetMarket" defaultValue={v.targetMarket} rows={2} className={inputCls} /></label>
              <label><span className={labelCls}>The 3 Uniques (one per line)</span><textarea name="uniques" defaultValue={v.uniques} rows={3} className={inputCls} /></label>
              <div className="grid grid-cols-1 gap-3">
                <label><span className={labelCls}>Proven Process</span><input name="provenProcess" defaultValue={v.provenProcess} className={inputCls} /></label>
                <label><span className={labelCls}>Guarantee</span><input name="guarantee" defaultValue={v.guarantee} className={inputCls} /></label>
              </div>

              <fieldset className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:grid-cols-3">
                <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">3-Year Picture</legend>
                <label><span className={labelCls}>Future date</span><input name="threeYrDate" defaultValue={v.threeYrDate} placeholder="Dec 31, 2029" className={inputCls} /></label>
                <label><span className={labelCls}>Revenue</span><input name="threeYrRevenue" defaultValue={v.threeYrRevenue} placeholder="$3M" className={inputCls} /></label>
                <label><span className={labelCls}>Profit</span><input name="threeYrProfit" defaultValue={v.threeYrProfit} className={inputCls} /></label>
                <label className="sm:col-span-3"><span className={labelCls}>Measurables (one per line)</span><textarea name="threeYrMeasurables" defaultValue={v.threeYrMeasurables} rows={2} className={inputCls} /></label>
                <label className="sm:col-span-3"><span className={labelCls}>What it looks like (one per line)</span><textarea name="threeYrPicture" defaultValue={v.threeYrPicture} rows={4} className={inputCls} /></label>
              </fieldset>

              <fieldset className="sm:col-span-2 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:grid-cols-3">
                <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">1-Year Plan</legend>
                <label><span className={labelCls}>Future date</span><input name="oneYrDate" defaultValue={v.oneYrDate} placeholder="Dec 31, 2026" className={inputCls} /></label>
                <label><span className={labelCls}>Revenue</span><input name="oneYrRevenue" defaultValue={v.oneYrRevenue} className={inputCls} /></label>
                <label><span className={labelCls}>Profit</span><input name="oneYrProfit" defaultValue={v.oneYrProfit} className={inputCls} /></label>
                <label className="sm:col-span-3"><span className={labelCls}>Measurables (one per line)</span><textarea name="oneYrMeasurables" defaultValue={v.oneYrMeasurables} rows={2} className={inputCls} /></label>
                <label className="sm:col-span-3"><span className={labelCls}>Goals for the year (one per line)</span><textarea name="oneYrGoals" defaultValue={v.oneYrGoals} rows={4} className={inputCls} /></label>
              </fieldset>

              <div className="sm:col-span-2"><button className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-700">Save vision</button></div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
