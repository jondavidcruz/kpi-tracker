import { archiveDeal, saveDeal, closeDeal } from "@/app/actions";
import { getCurrentUser, isManager, canAccessMarketing } from "@/lib/auth";
import { getActiveDeals, getActiveReps, getSettings } from "@/lib/data";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/date";
import { analyzeDeal, agingClasses } from "@/lib/deals";
import { Card, SectionTitle } from "@/components/ui";
import HubTabs from "@/components/HubTabs";
import { matchBuyersForDeal, type BuyerMatch } from "@/lib/buyer-match";
import type { Deal } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUSES = [
  { key: "under_contract", label: "Under Contract", cls: "bg-sky-100 text-sky-800" },
  { key: "marketing", label: "Marketing", cls: "bg-amber-100 text-amber-800" },
  { key: "buyer_found", label: "Buyer Found", cls: "bg-violet-100 text-violet-800" },
  { key: "in_escrow", label: "In Escrow", cls: "bg-indigo-100 text-indigo-800" },
  { key: "closed", label: "Closed", cls: "bg-emerald-100 text-emerald-800" },
  { key: "dead", label: "Dead", cls: "bg-slate-200 text-slate-600" },
];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const lblCls = "block text-[11px] font-semibold text-slate-500 mb-0.5";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; closed?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const deals = await getActiveDeals();
  const reps = await getActiveReps();
  const me = await getCurrentUser();
  const canClose = !!me && (isManager(me) || me.position === "dispositions");
  // Markets & Buyers: surface vetted buyers whose target areas match each deal's address.
  // Read-only — REI Reply stays the CRM; this is just a "who do we already know here?" hint.
  const mktAccess = canAccessMarketing(me);
  // Vetted buyers only — JV partners (type "jv_partner") are managed separately on /marketing, not matched here.
  const buyers = mktAccess ? (await db.marketContact.findMany({ orderBy: { sortOrder: "asc" } })).filter((b) => b.type !== "jv_partner") : [];
  const ERRORS = {
    hud: "A HUD statement is required to close a deal.",
    fields: "Add a valid close date and profit amount.",
    size: "That HUD file is over 4MB — compress it or upload a single statement.",
    type: "HUD must be a PDF or image file.",
    dup: "A closed deal already exists for that property + date.",
    missing: "Couldn't find that deal.",
  } as const;
  const errMsg = sp.err ? ERRORS[sp.err as keyof typeof ERRORS] : null;
  const dispoReps = reps.filter((r) => r.position === "dispositions").map((r) => r.name);
  // include any names already on deals (e.g. legacy "Sharyn") so they still show.
  const repNames = Array.from(new Set([...dispoReps, ...deals.map((d) => d.assignedTo).filter(Boolean)]));

  const byStatus = STATUSES.map((s) => ({ ...s, count: deals.filter((d) => d.status === s.key).length }));
  const openCount = deals.filter((d) => !["dead", "closed"].includes(d.status)).length;

  return (
    <div className="space-y-6">
      <HubTabs tabs={[{ href: "/deals", label: "Active deals" }, { href: "/closing", label: "Escrow & Closing" }, { href: "/closed-deals", label: "Closed deals" }]} />
      <SectionTitle
        title="🤝 Deals Board"
        subtitle="Dispositions pipeline with real-time aging & next-step tracking."
        accent="bg-brand-gold"
        right={<span className="text-sm font-semibold text-slate-500">{openCount} active</span>}
      />

      {sp.saved && (
        <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
          ✓ Saved.
        </div>
      )}
      {sp.closed && (
        <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
          🎉 Deal closed &amp; verified — it&apos;s now in Closed Deals.
        </div>
      )}
      {errMsg && (
        <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">
          ⚠️ {errMsg}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {byStatus.map((s) => (
          <Card key={s.key} className="p-3 text-center">
            <div className={`mx-auto mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>{s.label}</div>
            <div className="text-2xl font-extrabold tabular-nums text-slate-800">{s.count}</div>
          </Card>
        ))}
      </div>

      {/* Add a deal (compact) */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">+ Add a deal</h3>
        <form action={saveDeal} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input name="address" placeholder="Property address *" className={`${inputCls} sm:col-span-2`} required />
          <select name="status" defaultValue="under_contract" className={inputCls}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select name="assignedTo" defaultValue="" className={inputCls}>
            <option value="">assign to…</option>
            {repNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <input name="dealType" placeholder="Type (Novation…)" className={inputCls} />
          <input name="contractPrice" placeholder="Contract $" className={inputCls} />
          <input name="assignmentFee" placeholder="Est. profit $" className={inputCls} />
          <input type="date" name="onMarketSince" className={inputCls} title="On market since" />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Add deal
          </button>
        </form>
      </Card>

      {/* Deal cards (full detail + aging) */}
      <div className="space-y-3">
        {deals.length === 0 && (
          <Card className="p-10 text-center text-slate-400">No deals yet. Add your first one above.</Card>
        )}
        {deals.map((d) => (
          <DealCard
            key={d.id}
            deal={d}
            today={today}
            repNames={repNames}
            canClose={canClose}
            matches={mktAccess ? matchBuyersForDeal(d.address, d.contractPrice ?? d.askingPrice, buyers) : []}
          />
        ))}
      </div>
    </div>
  );
}

function DealCard({ deal, today, repNames, canClose, matches }: { deal: Deal; today: string; repNames: string[]; canClose: boolean; matches: BuyerMatch[] }) {
  const st = STATUSES.find((s) => s.key === deal.status) ?? STATUSES[0];
  const isLive = !["dead", "closed"].includes(deal.status);
  const aging = analyzeDeal(deal, today);
  const defaultLead = /ppl/i.test(deal.source) ? "ppl" : "cold_call";

  return (
    <Card className="p-4">
      {/* Header row: status, address, aging badge */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
        <span className="flex-1 font-bold text-slate-800">{deal.address}</span>
        {isLive && aging.days !== null && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${agingClasses(aging.level)}`}>
            {aging.days}d on market
          </span>
        )}
      </div>

      {/* Recommendation banner (only when there's something to act on) */}
      {isLive && (aging.level !== "fresh" || (aging.contractDaysLeft !== null && aging.contractDaysLeft <= 7)) && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${agingClasses(aging.level)}`}>
          💡 {aging.recommendation}
        </div>
      )}

      {/* Matching buyers from Markets & Buyers (read-only; full CRM lives in REI Reply) */}
      {matches.length > 0 && (
        <details open className="mb-3 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <summary className="cursor-pointer text-sm font-bold text-emerald-800">
            📤 Buyer cascade — send in this order ({matches.length})
          </summary>
          <p className="mt-1 text-[11px] text-emerald-700">Work top-down: offer to #1 first; only if they pass, move to #2. Ranked by area fit, then who pays the most &amp; closes fastest — not blasted to everyone.</p>
          <div className="mt-2 space-y-1.5">
            {matches.map((m) => {
              const reach = [m.phone, m.email, m.igHandle].filter(Boolean).join("  ·  ");
              const kind = /develop|custom|remodel|build/i.test(m.type) ? "Developer" : m.category === "luxury" ? "Developer" : "Flipper";
              const first = m.rank === 1;
              return (
                <div key={m.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg p-1.5 text-xs ${first ? "bg-white ring-1 ring-emerald-300" : ""}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${first ? "bg-emerald-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{m.rank}</span>
                  <span className="font-semibold text-slate-800">{m.name}</span>
                  {first && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">👑 Send first</span>}
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{kind}</span>
                  {m.vetStage === "active" && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">active buyer</span>}
                  {m.reasons.map((r, i) => (
                    <span key={i} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">{r}</span>
                  ))}
                  {m.bestContact && <span className="text-violet-700">📣 {m.bestContact}</span>}
                  {reach && <span className="text-brand-navy">{reach}</span>}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Vetted buyers only; dead/on-hold hidden. Sharpen each buyer&apos;s target areas + price box in Markets &amp; Buyers to tighten the ranking.
          </p>
        </details>
      )}

      <form action={saveDeal} className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        <input type="hidden" name="id" value={deal.id} />

        <Field label="Address" full><input name="address" defaultValue={deal.address} className={inputCls} /></Field>
        <Field label="Status">
          <select name="status" defaultValue={deal.status} className={inputCls}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Dispo rep">
          <select name="assignedTo" defaultValue={deal.assignedTo} className={inputCls}>
            <option value="">—</option>
            {repNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>

        <Field label="Type"><input name="dealType" defaultValue={deal.dealType} className={inputCls} placeholder="Novation…" /></Field>
        <Field label="Source"><input name="source" defaultValue={deal.source} className={inputCls} placeholder="PPL…" /></Field>
        <Field label="LM/AQ credit"><input name="lmAq" defaultValue={deal.lmAq} className={inputCls} /></Field>
        <Field label="Buyer"><input name="buyerName" defaultValue={deal.buyerName} className={inputCls} /></Field>

        <Field label="Contract $"><input name="contractPrice" defaultValue={deal.contractPrice ?? ""} className={inputCls} /></Field>
        <Field label="Asking $"><input name="askingPrice" defaultValue={deal.askingPrice ?? ""} className={inputCls} /></Field>
        <Field label="Est. profit $"><input name="assignmentFee" defaultValue={deal.assignmentFee ?? ""} className={inputCls} /></Field>
        <Field label="Sold $"><input name="soldPrice" defaultValue={deal.soldPrice ?? ""} className={inputCls} /></Field>

        {/* Key dates */}
        <Field label="Contract signed"><input type="date" name="contractDate" defaultValue={deal.contractDate} className={inputCls} /></Field>
        <Field label={dateLbl("Contract expires", aging.contractDaysLeft)}>
          <input type="date" name="contractExpiration" defaultValue={deal.contractExpiration} className={inputCls} />
        </Field>
        <Field label="On market since"><input type="date" name="onMarketSince" defaultValue={deal.onMarketSince} className={inputCls} /></Field>
        <Field label="Listing signed"><input type="date" name="listingSignedDate" defaultValue={deal.listingSignedDate} className={inputCls} /></Field>
        <Field label={dateLbl("Listing expires", aging.listingDaysLeft)}>
          <input type="date" name="listingExpiration" defaultValue={deal.listingExpiration} className={inputCls} />
        </Field>
        <Field label="Sold date"><input type="date" name="soldDate" defaultValue={deal.soldDate} className={inputCls} /></Field>

        {/* Next steps + notes */}
        <Field label="📋 Next steps" full>
          <textarea name="nextSteps" defaultValue={deal.nextSteps} rows={2} className={inputCls}
            placeholder="Where are we at? What's the plan to get it sold?" />
        </Field>
        <Field label="Notes" full>
          <textarea name="notes" defaultValue={deal.notes} rows={2} className={inputCls} />
        </Field>

        <div className="sm:col-span-3 lg:col-span-4 flex items-center gap-3">
          <button className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">Save</button>
        </div>
      </form>

      {/* Mark closed — HUD-verified. Dispo reps + managers only. */}
      {canClose && deal.status !== "closed" && (
        <details className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
          <summary className="cursor-pointer text-sm font-bold text-emerald-800">✅ Mark as closed (verify with HUD)</summary>
          <form action={closeDeal} className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
            <input type="hidden" name="dealId" value={deal.id} />
            <Field label="Close date *"><input type="date" name="closeDate" defaultValue={deal.soldDate || today} className={inputCls} required /></Field>
            <Field label="Our profit $ *"><input name="profit" defaultValue={deal.assignmentFee ?? ""} placeholder="net from HUD" className={inputCls} required /></Field>
            <Field label="Deal type">
              <select name="dealType" defaultValue="assignment" className={inputCls}>
                <option value="assignment">Assignment</option>
                <option value="jv">JV</option>
                <option value="wholetail">Wholetail</option>
                <option value="double_close">Double close</option>
                <option value="subject_to">Subject-to</option>
              </select>
            </Field>
            <Field label="Lead source">
              <select name="leadSource" defaultValue={defaultLead} className={inputCls}>
                <option value="ppl">Pay-per-lead</option>
                <option value="cold_call">Cold call</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Cost to acquire $"><input name="acquisitionCost" placeholder="optional" className={inputCls} /></Field>
            <Field label="📄 HUD statement * (PDF/image, ≤4MB)" full>
              <input type="file" name="hud" accept="application/pdf,image/*" required
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-700" />
            </Field>
            <Field label="Notes" full>
              <textarea name="notes" rows={2} defaultValue={deal.notes} className={inputCls} placeholder="Anything noteworthy about the close" />
            </Field>
            <div className="sm:col-span-3 lg:col-span-4">
              <button className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">Close deal &amp; file HUD</button>
              <p className="mt-1 text-[11px] text-slate-500">Closing pulls the deal off this board and adds it to Closed Deals with the HUD attached as proof.</p>
            </div>
          </form>
        </details>
      )}

      <form action={archiveDeal} className="mt-2">
        <input type="hidden" name="id" value={deal.id} />
        <button className="text-xs font-medium text-slate-400 hover:text-red-600">Archive deal</button>
      </form>
    </Card>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={full ? "sm:col-span-3 lg:col-span-4" : ""}>
      <span className={lblCls}>{label}</span>
      {children}
    </label>
  );
}

/** Append a days-left hint to a date label when an expiration is near/past. */
function dateLbl(base: string, daysLeft: number | null): string {
  if (daysLeft === null) return base;
  if (daysLeft < 0) return `${base} ⚠️ ${Math.abs(daysLeft)}d ago`;
  if (daysLeft <= 14) return `${base} (${daysLeft}d left)`;
  return base;
}
