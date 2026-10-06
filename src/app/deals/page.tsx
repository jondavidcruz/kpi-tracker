import { toggleDispoStepAction, archiveDeal, saveDeal, closeDeal, markCascade, sendCascadeOffer, readCascade, readBuyerTerms, armCascade, stopCascade, saveDealLand, readDealLand, readBuyerLand, logDealSendAction, updateDealSendAction, toggleBlacklistAction } from "@/app/actions";
import { readAuto, type DealCascade } from "@/lib/cascade";
import PacketPanel, { type PacketRow } from "@/components/PacketPanel";
import { DISPO_STEPS, readDispoChecklists } from "@/lib/dispo-checklist";
import { LAND_FIELDS, LAND_FALLOUT_REASONS, landFlags, type DealLand } from "@/lib/deal-land";
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
  searchParams: Promise<{ saved?: string; closed?: string; err?: string; cascade?: string }>;
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
  const buyers = mktAccess ? (await db.marketContact.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" } })).filter((b) => b.type !== "jv_partner") : [];
  const cascade = mktAccess ? await readCascade() : {};
  // Phase 7: every send + response per deal (feeds the buyer track record)
  const sendRows = mktAccess && deals.length
    ? await db.dealSend.findMany({
        where: { dealId: { in: deals.map((d) => d.id) } },
        orderBy: { sentAt: "desc" },
        include: { buyer: { select: { name: true, blacklistedAt: true } } },
      })
    : [];
  // Phase 8: offering packets per deal (newest first)
  const packetRows = mktAccess && deals.length
    ? await db.dealPacket.findMany({
        where: { dealId: { in: deals.map((d) => d.id) } },
        orderBy: { version: "desc" },
        select: { id: true, dealId: true, version: true, url: true, htmlUrl: true, createdAt: true, generatedBy: true, approvedAt: true, approvedBy: true, model: true },
      })
    : [];
  const packetsByDeal = new Map<string, PacketRow[]>();
  for (const r of packetRows) {
    const m = r.model as { toVerify?: string[] } | null;
    const arr = packetsByDeal.get(r.dealId) ?? [];
    arr.push({ id: r.id, version: r.version, url: r.url, htmlUrl: r.htmlUrl, createdAt: r.createdAt.toISOString(), generatedBy: r.generatedBy, approvedAt: r.approvedAt?.toISOString() ?? null, approvedBy: r.approvedBy, toVerify: m?.toVerify ?? [], warnings: [] });
    packetsByDeal.set(r.dealId, arr);
  }
  const dispoChecklists = mktAccess ? await readDispoChecklists() : {};
  const sendsByDeal = new Map<string, typeof sendRows>();
  for (const r of sendRows) {
    const arr = sendsByDeal.get(r.dealId) ?? [];
    arr.push(r);
    sendsByDeal.set(r.dealId, arr);
  }
  const terms = mktAccess ? await readBuyerTerms() : {};
  const buyerLand = mktAccess ? await readBuyerLand() : {};
  const buyersWithTerms = buyers.map((b) => ({ ...b, proofOfFunds: terms[b.id]?.pof, maxOfferPct: terms[b.id]?.maxOfferPct, isLandBuyer: buyerLand[b.id]?.isLandBuyer, targetZips: buyerLand[b.id]?.targetZips }));
  const auto = mktAccess ? await readAuto() : {};
  const landMap = await readDealLand();
  const buyerNameById = new Map(buyers.map((b) => [b.id, b.name] as const));
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
      {sp.cascade === "sent" && <div className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 ring-1 ring-sky-200">📧 Offer emailed to the buyer and marked sent. If they pass, hit &ldquo;Passed&rdquo; to advance the cascade.</div>}
      {sp.cascade === "nomail" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Marked sent, but that buyer has no email on file — add one on Vetted Buyers, or reach them by phone/IG.</div>}
      {sp.cascade === "armed" && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">🚀 Auto-cascade started — offer emailed to the top 3 matching buyers. It advances to the next 3 every ~3h until someone claims it, then pings the team.</div>}
      {sp.cascade === "noone" && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">No matching vetted buyer with an email was found for this deal — add buyers/emails on Vetted Buyers, then start again.</div>}
      {sp.cascade === "stopped" && <div className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">Auto-cascade stopped for that deal.</div>}
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
            matches={mktAccess ? matchBuyersForDeal(d.address, d.contractPrice ?? d.askingPrice, buyersWithTerms) : []}
            cascadeStatus={cascade[d.id] ?? {}}
            auto={auto[d.id]}
            claimedName={auto[d.id]?.claimedBy ? buyerNameById.get(auto[d.id]!.claimedBy!) ?? null : null}
            land={landMap[d.id]}
            sends={sendsByDeal.get(d.id) ?? []}
            canBlacklist={canClose}
            packets={packetsByDeal.get(d.id) ?? []}
            checklist={dispoChecklists[d.id] ?? {}}
          />
        ))}
      </div>
    </div>
  );
}

type SendRow = {
  id: string; buyerId: string; wave: number; channel: string; sentAt: Date;
  outcome: string; offerAmount: number | null; passReason: string; note: string;
  buyer: { name: string; blacklistedAt: Date | null };
};

function DealCard({ deal, today, repNames, canClose, matches, cascadeStatus, auto, claimedName, land, sends = [], canBlacklist = false, packets = [], checklist = {} }: { deal: Deal; today: string; repNames: string[]; canClose: boolean; matches: BuyerMatch[]; cascadeStatus: Record<string, string>; auto?: DealCascade; claimedName?: string | null; land?: DealLand; sends?: SendRow[]; canBlacklist?: boolean; packets?: PacketRow[]; checklist?: Record<string, { by: string; at: string }> }) {
  const lFlags = landFlags(land);
  // The next buyer to send to = highest-ranked one not already sent or passed.
  const nextId = matches.find((m) => cascadeStatus[m.id] !== "sent" && cascadeStatus[m.id] !== "passed")?.id ?? null;
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

      {/* Land diligence flags — the killers, at a glance */}
      {lFlags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {lFlags.map((f, i) => (
            <span key={i} className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">{f}</span>
          ))}
        </div>
      )}

      {/* Recommendation banner (only when there's something to act on) */}
      {isLive && (aging.level !== "fresh" || (aging.contractDaysLeft !== null && aging.contractDaysLeft <= 7)) && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${agingClasses(aging.level)}`}>
          💡 {aging.recommendation}
        </div>
      )}

      {/* 📣 Dispo marketing checklist (from Jon's Property Disposition doc, upgraded
          to point at the tools that automate each step). Done = name + timestamp. */}
      {(() => {
        const doneCount = DISPO_STEPS.filter((st) => checklist[st.key]).length;
        const pct = Math.round((doneCount / DISPO_STEPS.length) * 100);
        const phases = [...new Set(DISPO_STEPS.map((st) => st.phase))];
        return (
          <details className="mb-3 rounded-lg bg-emerald-50/70 p-3 ring-1 ring-emerald-200" open={doneCount > 0 && doneCount < DISPO_STEPS.length}>
            <summary className="cursor-pointer text-sm font-bold text-emerald-900">
              📣 Marketing checklist — {doneCount}/{DISPO_STEPS.length} done
              <span className="ml-2 inline-block h-1.5 w-28 overflow-hidden rounded-full bg-emerald-100 align-middle"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
            </summary>
            <p className="mt-1 text-[11px] text-emerald-800">Sell it in a week: blast everything Day 0, work the ranked list Days 1–3, escalate by Day 7. Check steps as you go — each shows who did it.</p>
            <div className="mt-2 space-y-2.5">
              {phases.map((ph) => (
                <div key={ph}>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">{ph}</div>
                  <div className="mt-1 space-y-1">
                    {DISPO_STEPS.filter((st) => st.phase === ph).map((st) => {
                      const done = checklist[st.key];
                      return (
                        <form key={st.key} action={toggleDispoStepAction} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-emerald-100">
                          <input type="hidden" name="dealId" value={deal.id} />
                          <input type="hidden" name="stepKey" value={st.key} />
                          <button className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-bold ring-1 ${done ? "bg-emerald-500 text-white ring-emerald-600" : "bg-white text-transparent ring-slate-300 hover:ring-emerald-400"}`}>✓</button>
                          <span className={`font-semibold ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>{st.label}</span>
                          <span className="hidden text-[11px] text-slate-400 sm:inline">{st.hint}</span>
                          {done && <span className="ml-auto text-[10px] font-semibold text-emerald-600">✓ {done.by.split(" ")[0]} · {new Date(done.at).toLocaleDateString()}</span>}
                        </form>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })()}

      {/* Phase 8 — Offering packet: APNs in, versioned diligence PDF out. */}
      <details className="mb-3 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200" open={packets.length > 0}>
        <summary className="cursor-pointer text-sm font-bold text-amber-800">📦 Offering packet ({packets.length ? `v${packets[0].version}${packets[0].approvedAt ? " ✅" : " draft"}` : "none yet"})</summary>
        <p className="mt-1 text-[11px] text-amber-700">Enter the APNs → one draft packet with parcel, FEMA flood, wetlands, and soils pulled automatically. Fill the 🟡 items after your county call, regenerate, then Approve — the approved version is what goes to buyers.</p>
        <div className="mt-2">
          <PacketPanel dealId={deal.id} packets={packets} canApprove={canClose} />
        </div>
      </details>

      {/* Phase 7 — Sends & responses: the buyer feedback loop. Two clicks to log an outcome. */}
      {(sends.length > 0 || matches.length > 0) && (
        <details className="mb-3 rounded-lg bg-violet-50 p-3 ring-1 ring-violet-200" open={sends.length > 0}>
          <summary className="cursor-pointer text-sm font-bold text-violet-800">📨 Sends &amp; responses ({sends.length})</summary>
          <p className="mt-1 text-[11px] text-violet-700">Every blast lands here automatically. When a buyer answers, set the outcome — offers + passes build each buyer&apos;s track record (lowballer / tire-kicker flags, hit rate).</p>
          <div className="mt-2 space-y-1.5">
            {sends.map((sd) => (
              <form key={sd.id} action={updateDealSendAction} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white p-1.5 text-xs ring-1 ring-violet-100">
                <input type="hidden" name="sendId" value={sd.id} />
                <span className="font-semibold text-slate-800">{sd.buyer.name}</span>
                {sd.buyer.blacklistedAt && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">⛔</span>}
                <span className="text-[10px] text-slate-400">w{sd.wave} · {sd.channel} · {new Date(sd.sentAt).toLocaleDateString()}</span>
                <select name="outcome" defaultValue={sd.outcome} className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px]">
                  <option value="">— outcome —</option>
                  <option value="no_reply">no reply</option>
                  <option value="pass">pass</option>
                  <option value="offer">offer</option>
                  <option value="loi">LOI</option>
                  <option value="closed">closed ✅</option>
                </select>
                <input name="offerAmount" defaultValue={sd.offerAmount ?? ""} placeholder="offer $" className="w-20 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px]" />
                <select name="passReason" defaultValue={sd.passReason} className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px]">
                  <option value="">pass reason…</option>
                  <option value="price">price</option>
                  <option value="acres">acres</option>
                  <option value="area">area</option>
                  <option value="timing">timing</option>
                  <option value="type">type</option>
                  <option value="other">other</option>
                </select>
                <input name="note" defaultValue={sd.note} placeholder="note" className="w-28 flex-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px]" />
                <button className="rounded-md bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-violet-700">Save</button>
              </form>
            ))}
            {sends.length > 0 && canBlacklist && (
              <form action={toggleBlacklistAction} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-1.5 text-xs ring-1 ring-violet-100">
                <span className="text-[11px] font-bold text-slate-500">⛔ Blacklist a buyer on this deal:</span>
                <select name="buyerId" className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px]">
                  {[...new Map(sends.map((sd) => [sd.buyerId, sd])).values()].map((sd) => (
                    <option key={sd.buyerId} value={sd.buyerId}>{sd.buyer.name}{sd.buyer.blacklistedAt ? " (blacklisted)" : ""}</option>
                  ))}
                </select>
                <input name="reason" placeholder="reason (kept on record)" className="w-44 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px]" />
                <button className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-slate-700">Blacklist</button>
                <button name="off" value="1" className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-slate-300">Un-blacklist</button>
              </form>
            )}
            {/* Log a send the cascade didn't make (call / text / portal) */}
            {matches.length > 0 && (
              <form action={logDealSendAction} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-1.5 text-xs ring-1 ring-violet-100">
                <input type="hidden" name="dealId" value={deal.id} />
                <span className="text-[11px] font-bold text-slate-500">+ Log a manual send:</span>
                <select name="buyerId" className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px]">
                  {matches.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <select name="channel" className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px]">
                  <option value="email">email</option>
                  <option value="text">text</option>
                  <option value="call">call</option>
                  <option value="portal">portal</option>
                </select>
                <button className="rounded-md bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-violet-700">Log send</button>
              </form>
            )}
          </div>
        </details>
      )}

      {/* Matching buyers from Markets & Buyers (read-only; full CRM lives in REI Reply) */}
      {matches.length > 0 && (
        <details open className="mb-3 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <summary className="cursor-pointer text-sm font-bold text-emerald-800">
            📤 Buyer cascade — send in this order ({matches.length})
          </summary>
          <p className="mt-1 text-[11px] text-emerald-700">Work top-down: offer to #1 first; only if they pass, move to #2. Ranked by area fit, then who pays the most &amp; closes fastest — not blasted to everyone.</p>

          {/* Automated cascade control */}
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-emerald-200">
            {auto?.status === "claimed" ? (
              <span className="text-xs font-bold text-emerald-700">🎯 Claimed by {claimedName ?? "a buyer"} — cascade stopped.</span>
            ) : auto?.status === "armed" ? (
              <>
                <span className="text-xs font-bold text-emerald-800">🟢 Auto-cascade running · round {auto.round} · emailed {Object.values(auto.sent).filter((v) => v === "sent" || v === "interested").length}</span>
                <span className="text-[11px] text-slate-400">Next 3 auto-send in ~3h if no one bites.</span>
                <form action={stopCascade} className="ml-auto"><input type="hidden" name="dealId" value={deal.id} /><button className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-300">Stop</button></form>
              </>
            ) : auto?.status === "done" ? (
              <>
                <span className="text-xs font-semibold text-slate-500">Cascade finished — no buyer claimed it.</span>
                <form action={armCascade} className="ml-auto"><input type="hidden" name="dealId" value={deal.id} /><button className="rounded-md bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-700">↻ Re-run</button></form>
              </>
            ) : (
              <>
                <span className="text-xs text-slate-600">Let it run itself — auto-emails the top 3, then the next 3 every ~3h until a buyer claims it.</span>
                <form action={armCascade} className="ml-auto"><input type="hidden" name="dealId" value={deal.id} /><button className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700">🚀 Start auto-cascade</button></form>
              </>
            )}
          </div>
          <div className="mt-2 space-y-1.5">
            {matches.map((m) => {
              const reach = [m.phone, m.email, m.igHandle].filter(Boolean).join("  ·  ");
              const kind = /develop|custom|remodel|build/i.test(m.type) ? "Developer" : m.category === "luxury" ? "Developer" : "Flipper";
              const status = cascadeStatus[m.id];
              const isNext = m.id === nextId;
              return (
                <div key={m.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg p-1.5 text-xs ${isNext ? "bg-white ring-1 ring-emerald-300" : status === "passed" ? "opacity-50" : ""}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${isNext ? "bg-emerald-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{m.rank}</span>
                  <span className="font-semibold text-slate-800">{m.name}</span>
                  {isNext && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">👑 Send next</span>}
                  {status === "sent" && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">✓ sent</span>}
                  {status === "passed" && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">passed</span>}
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{kind}</span>
                  {m.reasons.map((r, i) => (
                    <span key={i} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">{r}</span>
                  ))}
                  {reach && <span className="text-brand-navy">{reach}</span>}
                  {/* Cascade controls */}
                  {isNext && (
                    <span className="flex items-center gap-1">
                      {m.email && (
                        <form action={sendCascadeOffer}><input type="hidden" name="dealId" value={deal.id} /><input type="hidden" name="buyerId" value={m.id} /><button className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700">📧 Send offer</button></form>
                      )}
                      <form action={markCascade}><input type="hidden" name="dealId" value={deal.id} /><input type="hidden" name="buyerId" value={m.id} /><input type="hidden" name="status" value="sent" /><button className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-300" title="I sent it myself">Mark sent</button></form>
                      <form action={markCascade}><input type="hidden" name="dealId" value={deal.id} /><input type="hidden" name="buyerId" value={m.id} /><input type="hidden" name="status" value="passed" /><button className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-red-600" title="They passed — go to next">Passed →</button></form>
                    </span>
                  )}
                  {(status === "sent" || status === "passed") && (
                    <form action={markCascade}><input type="hidden" name="dealId" value={deal.id} /><input type="hidden" name="buyerId" value={m.id} /><input type="hidden" name="status" value="clear" /><button className="text-[10px] text-slate-300 hover:text-slate-600">undo</button></form>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Vetted buyers only; dead/on-hold hidden. Sharpen each buyer&apos;s target areas + price box in Markets &amp; Buyers to tighten the ranking.
          </p>
        </details>
      )}

      {/* Land diligence — structured fields the house deal record never had */}
      <details className="mb-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3" {...(lFlags.length ? { open: true } : {})}>
        <summary className="cursor-pointer text-sm font-bold text-amber-900">🌱 Land details {lFlags.length ? `· ${lFlags.length} flag${lFlags.length === 1 ? "" : "s"}` : ""}</summary>
        <form action={saveDealLand} className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          <input type="hidden" name="dealId" value={deal.id} />
          {LAND_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className={lblCls}>{f.label}</span>
              {f.type === "select" ? (
                <select name={f.key} defaultValue={land?.[f.key] ?? ""} className={inputCls}>
                  {(f.options ?? []).map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                </select>
              ) : (
                <input name={f.key} type={f.type === "number" ? "number" : "text"} step="any" defaultValue={land?.[f.key] ?? ""} placeholder={f.ph} className={inputCls} />
              )}
            </label>
          ))}
          <label className="block">
            <span className={lblCls}>Fallout reason (if dead)</span>
            <select name="falloutReason" defaultValue={land?.falloutReason ?? ""} className={inputCls}>
              <option value="">—</option>
              {LAND_FALLOUT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <div className="col-span-2 sm:col-span-4">
            <button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">Save land details</button>
          </div>
        </form>
      </details>

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
