import Link from "next/link";
import { db } from "@/lib/db";
import { formatAddress } from "@/lib/address";
import { getCurrentUser, isManager, canManageAllLeads } from "@/lib/auth";
import { getBuyerMatchesForLead, getNetworkMatchesForDeal, getDealsForNetworkLead } from "@/lib/buyer-match-lead";
import SendToBuyersButton from "@/components/SendToBuyersButton";
import { attachNetworkBuyerToDeal, runDispoCascadeAction } from "@/app/crm/actions";
import DispoBuyerTracker from "@/components/DispoBuyerTracker";
import DispoOffersPanel from "@/components/DispoOffersPanel";
import { readDispoOffers, offerStats, parseMoney, OFFER_GOAL } from "@/lib/dispo-offers";
import AssignmentContractPanel from "@/components/AssignmentContractPanel";
import { readAssignmentDraft } from "@/lib/assignment-contract";
import { nextDispoAction } from "@/lib/dispo-next-action";
import DispoMarketingChecklist from "@/components/DispoMarketingChecklist";
import DispoGatePanel from "@/components/DispoGatePanel";
import { readGateChecks } from "@/lib/dispo-gates";
import { readDispoBuyers, isDispoDealPipeline, isDispoNetworkPipeline, isDevNetworkName, isAgentNetworkName, stageMeta } from "@/lib/dispo-buyers";
import { readMarketingDone } from "@/lib/dispo-marketing";
import { getActiveReps, getSettings } from "@/lib/data";
import { readPipelines, parseTags, KIND_EMOJI, pipelineLockFor } from "@/lib/crm";
import { stripHtml, stripAgentNotesBlock, readParcels, splitCrammedParcels, recStreamSrc } from "@/lib/crm-shared";
import ParcelsPanel from "@/components/ParcelsPanel";
import PanelGuard from "@/components/PanelGuard";
import { formsForPipeline } from "@/lib/crm-forms";
import { Card } from "@/components/ui";
import CallButton from "@/components/CallButton";
import DraftOfferButton from "@/components/DraftOfferButton";
import { PANDADOC_DRAFTING_ENABLED } from "@/lib/pandadoc";
import { isHtmlNote, sanitizeNoteHtml, htmlNoteToText } from "@/lib/note-html";
import { editCrmNoteAction, deleteCrmNoteAction } from "../actions";
import LeadNoteComposer from "@/components/LeadNoteComposer";
import AutoSaveForm from "@/components/AutoSaveForm";
import OppPipelineMover from "@/components/OppPipelineMover";
import { setOppStageAction, logCrmTouchAction, saveOppMetaAction, saveCrmContactAction, addCrmTaskAction, toggleCrmTaskAction, addCrmApptAction, deleteCrmApptAction, addOpportunityAction, addCrmPartyAction, deleteCrmPartyAction, saveCrmFormAction, toggleDndAction, uploadLeadDocAction } from "../actions";
import { commsFor, readSignatures, firstOf, defaultSignature } from "@/lib/crm-comms";
import { readSnippets, readSequences, readSeqState } from "@/lib/crm-templates";
import SmsComposer from "@/components/SmsComposer";
import GmailComposer from "@/components/GmailComposer";
import { enrollSequenceAction, unenrollSequenceAction } from "../actions";

export const dynamic = "force-dynamic";
// ⏱ The contact page had no time budget set → the low platform default. Busy/active deals
// render just over it and the function is killed mid-stream (client sees "Connection closed",
// no server error logged). Give it the full 60s (Jon 2026-10-26).
export const maxDuration = 60;

// 🔗 Merge each tracked buyer's LIVE contact id + phone + email off its network
// lead opp, so the tracker rows can call/text/email and the note-sync knows the
// agent's contact. Stored entries only keep buyerId + a snapshot; this refreshes.
async function enrichDispoBuyers(buyers: Awaited<ReturnType<typeof readDispoBuyers>>) {
  const ids = buyers.map((b) => b.buyerId).filter((x): x is string => !!x);
  if (!ids.length) return buyers;
  const leads = await db.crmOpportunity.findMany({ where: { id: { in: ids } }, select: { id: true, contactId: true, contact: { select: { phone: true, email: true } } } }).catch(() => []);
  const byId = new Map(leads.map((l) => [l.id, l]));
  return buyers.map((b) => {
    const l = b.buyerId ? byId.get(b.buyerId) : undefined;
    return l ? { ...b, contactId: l.contactId ?? b.contactId, phone: b.phone || l.contact?.phone || undefined, email: b.email || l.contact?.email || undefined } : b;
  });
}

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const lbl = "block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5";

// 🔧 Dispo-panel block kill-switch (Jon 2026-10-26): the full page aborts the render
// stream on the heaviest signed/novation deals (cumulative function budget). Keep OFF
// until the common render is light enough across ALL deals, then re-enable.
const DP_ON = false;

// ⏱ Hard-bound a server call so a SLOW/HANGING query can never stall the whole page
// render (Jon 2026-10-26: novation contact pages failed with "Connection closed" — a
// stream abort a try/catch can't catch). On timeout we render with the fallback; the
// buyer-match/network panels degrade gracefully instead of taking the page down.
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    Promise.resolve(p).catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function OpportunityPageInner({ params, searchParams }: { params: Promise<{ oppId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { oppId } = await params;
  // 🔧 TEMP debug: ?dbg=LMR skips the Left/Middle/Right columns to localize the
  // novation "Connection closed" stream abort (Jon 2026-10-26).
  const dbg = String((searchParams ? await searchParams : {})?.dbg ?? "").toUpperCase();
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  const manager = isManager(me);
  if (!allowed) return <Card className="p-10 text-center text-slate-400">The Seller CRM is for acquisitions + managers.</Card>;
  const settings = await getSettings();
  const tz = settings.orgTimezone;

  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, include: { contact: true } });
  if (!opp) return <Card className="p-10 text-center text-slate-400">Lead not found. <Link href="/crm" className="font-bold text-sky-700 underline">Back to the pipeline</Link></Card>;
  // Reps open only leads in THEIR pipeline (managers see everything).
  const followersList = Array.isArray((opp.formData as Record<string, unknown> | null)?.__followers) ? ((opp.formData as Record<string, unknown>).__followers as string[]) : [];
  // 🔒 Pipeline-locked rep (Jon 2026-10-16): can open ANY lead in their allowed
  // pipeline(s) but NOTHING outside — overrides the per-assignee guard below.
  const lockPipes = await pipelineLockFor(me);
  if (lockPipes?.length) {
    const oppPipe = opp.pipeline || "War Room";
    if (!lockPipes.includes(oppPipe)) {
      return <Card className="p-10 text-center text-slate-400">This lead isn&apos;t in your pipeline. <Link href="/crm" className="font-bold text-sky-700 underline">Back to your pipeline</Link></Card>;
    }
  } else if (!canManageAllLeads(me!) && opp.assignedTo && opp.assignedTo !== me!.name && !followersList.includes(me!.name)) {
    return <Card className="p-10 text-center text-slate-400">This lead is in {opp.assignedTo.split(" ")[0]}&apos;s pipeline. <Link href="/crm" className="font-bold text-sky-700 underline">Back to yours</Link></Card>;
  }
  const c = opp.contact;
  // 🔒 Who may see our BUYERS (Smart Match + matching cash buyers): dispositions reps
  // + managers/owner ONLY (Jon 2026-10-21: "protect our buyers" — Nick, Kyle, Michelle
  // and any acquisitions/new rep must NOT see them). And ONLY on the dispo land-deal
  // pipelines — never on home/seller leads.
  const canSeeBuyers = isManager(me) || me?.position === "dispositions";
  // 🔧 TEMPORARY (Jon 2026-10-26): the dispo-panel block aborts the page stream on
  // novation deals ("Connection closed" — uncatchable by boundaries/try-catch). Disable
  // it to restore open-full immediately; re-enable per-section with ?dp=1 to pinpoint.
  const showMatches = DP_ON && canSeeBuyers && isDispoDealPipeline(opp.pipeline);
  // 🕒 days in the current stage (for the next-step banner's "stalled" case) — dispo only
  const dealDaysInStage = showMatches
    ? Math.floor((Date.now() - ((await db.crmEvent.findFirst({ where: { oppId: opp.id, kind: "stage" }, orderBy: { at: "desc" }, select: { at: true } }).catch(() => null))?.at ?? opp.createdAt).getTime()) / 86400000)
    : 0;
  // 🔙 Back goes to where this lead lives — AND to the SAME pipeline it's in, so
  // editing a lead never bounces you to a different board (Jon 2026-10-24: "stop
  // the resets, keep me on what I was working on").
  const backHref = isDevNetworkName(opp.pipeline) ? "/dispo?tab=developers"
    : isAgentNetworkName(opp.pipeline) ? "/dispo?tab=agents"
    : isDispoDealPipeline(opp.pipeline) ? `/dispo?tab=deals&dealpl=${encodeURIComponent(opp.pipeline)}`
    : `/crm?pl=${encodeURIComponent(opp.pipeline || "War Room")}`;
  const leadFeatures = (() => { const f = (opp.formData as { land?: { features?: unknown } } | null)?.land?.features; return Array.isArray(f) ? (f as string[]) : []; })();
  const buyerMatches = showMatches ? await withTimeout(getBuyerMatchesForLead(c.address || opp.title, opp.value ?? opp.askPrice, leadFeatures), 8000, []) : [];
  // 🎯 Smart Match from the buyer-network CRM (developers + agents), on dispo deals only.
  const networkMatches = showMatches ? await withTimeout(getNetworkMatchesForDeal(c.address || opp.title), 8000, []) : [];
  // 🔗 On a buyer-agent / developer lead: every deal they're on (last talk + offer + next follow-up).
  const isNetworkLead = isDevNetworkName(opp.pipeline) || isAgentNetworkName(opp.pipeline);
  const leadDeals = canSeeBuyers && isNetworkLead ? await getDealsForNetworkLead(opp.id) : [];
  const todayPT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const attachedBuyerIds = new Set(readDispoBuyers(opp.formData).map((b) => b.buyerId).filter(Boolean));

  // ⚠️ duplicate-seller guard (nightly ?crmqa=1 found 16 phones split across
  // reps): any OTHER live contact sharing this phone is flagged on the card so
  // two reps don't work the same seller blind. Read-only; merging stays manual.
  const last10 = (c.phone || "").replace(/\D/g, "").slice(-10);
  const [pipelines, reps, events, tasks, appts, siblingOpps, parties, dupContacts] = await Promise.all([
    readPipelines(),
    getActiveReps(),
    db.crmEvent.findMany({ where: { contactId: c.id }, orderBy: { at: "desc" }, take: 60 }),
    db.crmTask.findMany({ where: { oppId }, orderBy: [{ doneAt: "asc" }, { due: "asc" }] }),
    db.crmAppointment.findMany({ where: { oppId }, orderBy: { at: "asc" } }),
    db.crmOpportunity.findMany({ where: { contactId: c.id, archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, stage: true, pipeline: true, formData: true } }),
    db.crmParty.findMany({ where: { oppId }, orderBy: { createdAt: "asc" } }),
    last10.length === 10
      ? db.crmContact.findMany({ where: { id: { not: c.id }, archivedAt: null, OR: [{ phone: { endsWith: last10 } }, { altPhone: { endsWith: last10 } }] }, select: { id: true, name: true, assignedTo: true, opportunities: { where: { archivedAt: null }, select: { id: true, title: true, stage: true }, take: 1 } }, take: 5 })
      : Promise.resolve([] as Array<{ id: string; name: string; assignedTo: string; opportunities: Array<{ id: string; title: string; stage: string }> }>),
  ]);
  const [snippets, sequences, seqState] = await Promise.all([readSnippets(), readSequences(), readSeqState()]);
  const enrolled = seqState[opp.id];
  // 📁 auto-pull this deal's existing Google Drive files (best-effort; no manual
  // export needed). Matched by the property address / street number.
  const driveFiles = (await withTimeout(import("@/lib/gdrive").then((m) => m.listDealFiles(c.address || opp.title || c.name)), 2500, [] as { id: string; name: string; link: string; mimeType: string }[])).slice(0, 12);
  const pipe = pipelines.find((x) => x.name === (opp.pipeline || "War Room")) ?? pipelines[0];
  const stages = pipe.stages;
  const st = stages.find((s) => s.key === opp.stage);
  const comms = await commsFor(me!);
  const mySignature = (await readSignatures())[firstOf(me!.name)] || defaultSignature(me!.name);
  const fmtAt = (d: Date) => d.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const devH = opp.devPricingSentAt ? Math.round((Date.now() - opp.devPricingSentAt.getTime()) / 3_600_000) : null;

  return (
    <PanelGuard label="contact-full">
    <div className="space-y-4">
      {/* ── Header: who, stage, actions ── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={backHref} className="text-sm font-bold text-slate-400 hover:text-slate-600">←</Link>
          <div>
            <div className="text-lg font-extrabold tracking-tight text-slate-900">{c.name}</div>
            <div className="text-xs text-slate-500">{formatAddress(opp.title)}</div>
          </div>
          <form action={setOppStageAction} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={opp.id} />
            <select name="stage" defaultValue={opp.stage} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold">
              {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Move</button>
          </form>
          {opp.stage === "at_developers" && devH != null && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${devH >= 36 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>⏳ {devH}h at developers</span>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {comms.call && c.phone && <CallButton phone={c.phone} name={c.name} oppId={opp.id} contactId={c.id} label="📞 Call" />}
            {comms.call && c.altPhone && <CallButton phone={c.altPhone} name={c.name} oppId={opp.id} contactId={c.id} label="📞 Alt" subtle />}
            
            {!comms.call && !comms.sms && !comms.email && <span className="rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-400" title="Notes, tasks, stages & appointments are all yours — paid channels are off for your account">📝 notes-only access</span>}
            <a href={`/underwriting?address=${encodeURIComponent(opp.title)}&opp=${encodeURIComponent(opp.id)}`} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">🧮 Underwrite</a>
          </span>
        </div>

        {/* Salesforce-style path: the whole pipeline as a clickable chevron bar —
            green behind the current stage, one click moves the lead. */}
        <div className="mt-3 flex gap-[3px] overflow-x-auto pb-1">
          {stages.map((s, i) => {
            const curIdx = stages.findIndex((x) => x.key === opp.stage);
            const done = i < curIdx, current = i === curIdx;
            return (
              <form key={s.key} action={setOppStageAction} className="min-w-0 flex-1" style={{ minWidth: 86 }}>
                <input type="hidden" name="id" value={opp.id} />
                <input type="hidden" name="stage" value={s.key} />
                <button
                  title={current ? `Current stage: ${s.label}` : `Move to ${s.label}`}
                  disabled={current}
                  className={`w-full truncate px-2 py-1.5 text-center text-[10px] font-bold transition first:rounded-l-full last:rounded-r-full ${
                    current ? "bg-brand-navy text-white"
                    : done ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                  style={{ clipPath: i === stages.length - 1 ? undefined : "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)" }}
                >{s.label}</button>
              </form>
            );
          })}
        </div>
        {stripAgentNotesBlock(c.pinnedNote) && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">📌 {stripAgentNotesBlock(c.pinnedNote)}</div>}
        {dupContacts.length > 0 && (
          <div className="mt-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
            ⚠️ Same phone is also on{" "}
            {dupContacts.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ", "}
                {d.opportunities[0]
                  ? <Link href={`/crm/${d.opportunities[0].id}`} className="underline">{d.name}</Link>
                  : d.name}
                {d.assignedTo ? ` (${d.assignedTo.split(" ")[0]})` : ""}
              </span>
            ))}
            {" "}— check before calling; notes may be split across cards.
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[300px_minmax(0,1fr)_330px] xl:items-start">
        {/* ── LEFT: who they are ── */}
        {!dbg.includes("L") && (
        <div className="order-2 flex min-w-0 flex-col gap-3 xl:order-none">
          {/* contact card */}
          <Card className="p-4">
            <details open id="contact" className="scroll-mt-4">
              <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-slate-400">👤 Contact — all phones &amp; emails (edit)</summary>
              <AutoSaveForm action={saveCrmContactAction} className="mt-2 space-y-2">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="oppId" value={opp.id} />
                <div className="grid grid-cols-2 gap-2">
                  <label><span className={lbl}>Name</span><input name="name" defaultValue={c.name} className={inputCls} /></label>
                  <label><span className={lbl}>Phone</span><input name="phone" defaultValue={c.phone} className={inputCls} /></label>
                  <label><span className={lbl}>Phone 2</span><input name="altPhone" defaultValue={c.altPhone} className={inputCls} /></label>
                  <label><span className={lbl}>Email</span><input name="email" defaultValue={c.email} className={inputCls} /></label>
                  <label><span className={lbl}>Email 2</span><input name="altEmail" defaultValue={c.altEmail} className={inputCls} /></label>
                </div>
                {/* 📬 Contact = the PERSON, not the property. Mailing address only;
                    the property address + APN live on the Opportunity + Home/Land
                    Details (Jon 2026-10-24). */}
                <label><span className={lbl}>📬 Mailing address — where they live (not the property)</span><input name="address" defaultValue={c.address} placeholder="Seller's home / mailing address" className={inputCls} /></label>
                <label><span className={lbl}>Contact tags</span><input name="ctags" defaultValue={c.tags} placeholder="motivated, probate…" className={inputCls} /></label>
                <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">Save contact</button>
              </AutoSaveForm>
            </details>
            <div className="mt-2 space-y-1 text-[13px] text-slate-700">
              {c.phone && <div>📱 {c.phone}{c.altPhone ? ` · ${c.altPhone}` : ""}</div>}
              {c.email && <div>✉️ {c.email}{c.altEmail ? ` · ${c.altEmail}` : ""}</div>}
              {c.address && <div>📬 {c.address} <span className="text-[11px] text-slate-400">(mailing)</span></div>}
              <div className="text-xs text-slate-400">Source: {c.source || "—"} · added {c.createdAt.toLocaleDateString()}</div>
              {parseTags(c.tags).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">{parseTags(c.tags).map((t) => <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">#{t}</span>)}</div>
              )}
            </div>
            {/* 📦 Parcels on THIS deal (one card, many parcels) — shows for land deals
                with an APN or more than one address (Jon 2026-10-21). */}
            {(() => {
              const parcels = readParcels(opp.formData);
              const crammedApn = ((opp.formData as { property?: { apn?: string } } | null)?.property?.apn) ?? "";
              const show = parcels.length > 0 || splitCrammedParcels(c.address, crammedApn).length > 0;
              return show ? <div className="mt-3"><ParcelsPanel oppId={opp.id} parcels={parcels} crammedAddress={c.address} crammedApn={crammedApn} /></div> : null;
            })()}

            {/* multi-opportunity */}
            <div className="mt-3 border-t border-slate-100 pt-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">🔗 All opportunities for {c.name.split(" ")[0]} ({siblingOpps.length}) — each is its own card with its own notes</div>
              {siblingOpps.map((o) => {
                const sibApn = (o.formData as { property?: { apn?: string } } | null)?.property?.apn;
                const current = o.id === oppId;
                return (
                  <Link key={o.id} href={`/crm/${o.id}`} className={`mt-1 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${current ? "bg-brand-navy/5 text-brand-navy ring-1 ring-brand-navy/20" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
                    {current && <span className="shrink-0 rounded bg-brand-navy px-1 py-0.5 text-[8px] font-bold text-white">● viewing</span>}
                    <span className="flex-1 truncate">{o.title}{sibApn ? <span className="ml-1 font-normal text-slate-400">· APN {sibApn}</span> : null}</span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{o.stage}</span>
                  </Link>
                );
              })}
              {/* add another parcel — its own opportunity, with address + APN */}
              <form action={addOpportunityAction} className="mt-1.5 space-y-1.5">
                <input type="hidden" name="contactId" value={c.id} />
                <input name="title" required placeholder="＋ another property / address (required) …" className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                <div className="flex gap-1.5">
                  <input name="apn" placeholder="🧭 APN / Parcel # (optional)" className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                  <button className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white hover:bg-slate-700">Add</button>
                </div>
              </form>
            </div>
          </Card>

          {/* 🔕 DND by channel (GHL-style, Jon 2026-10-08) — blocks senders cold */}
          <Card className="p-4">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">🔕 DND — Do Not Disturb</div>
            <div className="grid grid-cols-2 gap-1.5">
              {([["all", "🚫 ALL channels"], ["sms", "💬 Text messages"], ["email", "✉️ Email"], ["call", "📞 Calls"]] as const).map(([ch, label]) => {
                const on = new RegExp(`\\bdnd_${ch}\\b`).test(c.tags) || (ch !== "all" && /\bdnd_all\b|\bdnc\b/.test(c.tags));
                return (
                  <form key={ch} action={toggleDndAction}>
                    <input type="hidden" name="contactId" value={c.id} />
                    <input type="hidden" name="channel" value={ch} />
                    <button className={`w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-bold ring-1 ${on ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100"}`}>
                      {on ? "⛔ " : ""}{label}
                    </button>
                  </form>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400">Red = blocked. Texts/emails are refused server-side and logged; incoming STOP replies set this automatically.</p>
          </Card>

          {/* 📎 Documents — every file saved on this lead (PandaDoc, Drive, uploads) */}
          <Card className="p-4">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">📎 Documents</div>
            <form action={uploadLeadDocAction} className="mb-2 flex flex-wrap items-center gap-1.5">
              <input type="hidden" name="oppId" value={opp.id} />
              <input type="hidden" name="contactId" value={c.id} />
              <select name="docType" defaultValue="" className="rounded-lg border border-slate-200 px-1.5 py-1 text-[10px] font-semibold text-slate-600" title="What kind of document is this?">
                <option value="">Type (auto)…</option>
                <option>Purchase Agreement</option>
                <option>Assignment Agreement</option>
                <option>Listing Agreement</option>
                <option>Disclosure Agreement</option>
                <option>Addendum</option>
                <option>Miscellaneous</option>
              </select>
              <input type="file" name="file" required className="min-w-0 flex-1 text-[10px] text-slate-500 file:mr-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-[10px] file:font-bold file:text-slate-600" />
              <button className="rounded-lg bg-brand-navy px-2.5 py-1 text-[10px] font-bold text-white">⬆ to Drive</button>
            </form>
            {events.filter((e) => e.kind === "file").length === 0 && driveFiles.length === 0 ? (
              <p className="text-xs text-slate-400">No documents yet — upload above, or signed PandaDocs attach automatically. Everything lands in the deal&apos;s Google Drive folder.</p>
            ) : (
              <div className="space-y-1.5">
                {events.filter((e) => e.kind === "file").map((e) => {
                  const link = (e.meta as { link?: string } | null)?.link;
                  const name = stripHtml(e.body).replace(/^📎\s*/, "").slice(0, 90);
                  return (
                    <a key={e.id} href={link ?? "#"} target="_blank" rel="noreferrer" className={`block rounded-lg px-2.5 py-1.5 text-xs ring-1 ${link ? "bg-indigo-50/50 text-indigo-800 ring-indigo-100 hover:bg-indigo-50" : "bg-slate-50 text-slate-500 ring-slate-100"}`}>
                      📄 {name}
                      <span className="block text-[9px] text-slate-400">{e.at.toLocaleDateString("en-US")} · {e.actor}</span>
                    </a>
                  );
                })}
                {/* 📁 files that already live in the deal's Google Drive folder —
                    auto-synced so the team doesn't export/re-import by hand */}
                {driveFiles.length > 0 && (
                  <>
                    <div className="pt-1 text-[9px] font-bold uppercase tracking-wide text-slate-300">📁 From Google Drive ({driveFiles.length})</div>
                    {driveFiles.map((f) => (
                      <a key={f.id} href={f.link} target="_blank" rel="noreferrer" className="block rounded-lg bg-emerald-50/50 px-2.5 py-1.5 text-xs text-emerald-800 ring-1 ring-emerald-100 hover:bg-emerald-50">
                        {f.mimeType.includes("image") ? "🖼" : f.mimeType.includes("pdf") ? "📕" : f.mimeType.includes("spreadsheet") ? "📊" : f.mimeType.includes("document") ? "📝" : "📄"} {f.name.slice(0, 90)}
                        <span className="block text-[9px] text-emerald-500/70">in the deal&apos;s Drive folder</span>
                      </a>
                    ))}
                  </>
                )}
              </div>
            )}
          </Card>

          {/* opportunity meta */}
          <Card className="p-4">
            <div id="opp" className="mb-1.5 scroll-mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">🎯 Opportunity</div>
            {/* Pipeline lives OUTSIDE the autosave form: changing it reveals the
                target pipeline's stages + an explicit Move button (Nick's ticket). */}
            <div className="mb-2">
              <span className={lbl}>Pipeline</span>
              <OppPipelineMover id={opp.id} pipeline={opp.pipeline || "War Room"} pipelineNames={pipelines.map((pp) => pp.name).filter((n) => isDispoNetworkPipeline(opp.pipeline) || !isDispoNetworkPipeline(n))}
                pipelineStages={Object.fromEntries(pipelines.map((pp) => [pp.name, pp.stages.map((s) => ({ key: s.key, label: s.label }))]))} selectCls={inputCls} />
            </div>
            <AutoSaveForm action={saveOppMetaAction} className="space-y-2">
              <input type="hidden" name="id" value={opp.id} />
              <label><span className={lbl}>🏠 Property address <span className="font-normal normal-case text-slate-400">— the deal (lead is named after the seller)</span></span><input name="title" defaultValue={formatAddress(opp.title)} placeholder="123 Main St, City, ST ZIP" className={inputCls} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label><span className={lbl}>Est. value / fee $</span><input name="value" defaultValue={opp.value ?? ""} className={inputCls} /></label>
                <label><span className={lbl}>Assigned to</span>
                  <select name="assignedTo" defaultValue={opp.assignedTo} className={inputCls}>
                    <option value="">unassigned</option>
                    {reps.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select></label>
                <label><span className={lbl}>Next follow-up</span><input type="date" name="nextFollowUp" defaultValue={opp.nextFollowUp} className={inputCls} /></label>
              </div>
              <label><span className={lbl}>Tags</span><input name="tags" defaultValue={opp.tags} placeholder="hot, novation, flood-check…" className={inputCls} /></label>
              <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">Save</button>
            </AutoSaveForm>
          </Card>

        </div>
        )}

        {/* ── MIDDLE: comms — the main event (SMS / email / notes / timeline) ── */}
        {!dbg.includes("M") && (
        <div className="order-1 min-w-0 space-y-2.5 xl:order-none">
          <Card className="p-3">
            {/* 📝 the SAME smart note editor as the quickview — bold, underline,
                bullets, attach (Jon 2026-10-24: "make notes smart like quick notes") */}
            <LeadNoteComposer oppId={opp.id} contactId={c.id} />
            <form action={logCrmTouchAction} className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <input type="hidden" name="oppId" value={opp.id} />
              <input type="hidden" name="contactId" value={c.id} />
              <span className="font-bold text-slate-400">Or just log a touch:</span>
              <button name="kind" value="call" className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600 hover:bg-slate-200">📞 called</button>
              <button name="kind" value="sms" className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600 hover:bg-slate-200">💬 texted</button>
              <button name="kind" value="email" className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600 hover:bg-slate-200">✉️ emailed</button>
              <input name="body" placeholder="what was said (optional)" className="min-w-[120px] flex-1 rounded-lg border border-slate-200 px-2 py-1" />
            </form>
          </Card>

          {/* 💬 Full conversation — texts + emails + calls combined, oldest→newest
              so you can scroll up to the very first touch (Jon 2026-10-13). */}
          {(() => {
            const commsEv = [...events].reverse().filter((e) => ["sms", "email", "call", "voicemail"].includes(e.kind));
            if (!commsEv.length) return null;
            return (
              <Card className="overflow-hidden p-0">
                <div className="border-b border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">💬 Full conversation — every text, email &amp; call</div>
                <div className="max-h-96 space-y-2 overflow-y-auto p-3">
                  {commsEv.map((e) => {
                    const body = stripHtml(e.body);
                    const inbound = body.startsWith("⬅");
                    const clean = body.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "");
                    const when = e.at.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                    if (e.kind === "call" || e.kind === "voicemail") {
                      const recLink = (e.meta as { link?: string } | null)?.link;
                      const isRec = recLink && clean.startsWith("🎙");
                      return (
                        <div key={e.id} className="flex justify-center">
                          <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[11px] font-semibold text-slate-500 ${isRec ? "bg-white ring-1 ring-slate-200" : "rounded-full bg-slate-100"}`}>
                            <div>{KIND_EMOJI[e.kind] ?? "📞"} {clean.replace(/\s*—\s*https?:\/\/\S+$/, "")} · {when}</div>
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            {isRec && <audio controls preload="none" src={recStreamSrc(recLink)} className="mt-1 h-8 w-64 max-w-full" />}
                          </div>
                        </div>
                      );
                    }
                    const imgUrls = clean.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/gi) ?? [];
                    const textOnly = imgUrls.reduce((s, u) => s.replace(u, ""), clean).replace(/[[\]]/g, "").trim();
                    return (
                      <div key={e.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm ${inbound ? "rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-200" : "rounded-br-sm bg-brand-navy text-white"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {imgUrls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="photo" className="mb-1 max-h-48 rounded-lg" /></a>)}
                          {textOnly && <div className="whitespace-pre-line break-words">{textOnly}</div>}
                          <div className={`mt-0.5 text-right text-[9px] ${inbound ? "text-slate-400" : "text-white/60"}`}>{e.kind === "email" ? "✉️" : "💬"} {when}{!inbound && e.actor ? ` · ${e.actor.split(" ")[0]}` : ""}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })()}

          {comms.sms && c.phone && (
            <Card id="compose" className="scroll-mt-4 p-4">
              <SmsComposer history={[...events].reverse().filter((e) => e.kind === "sms").map((e) => { const b = stripHtml(e.body); return { body: b.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 400), inbound: b.startsWith("⬅"), at: e.at.toISOString() }; })} oppId={opp.id} contactId={c.id} to={c.phone} leadName={c.name} rep={me!.name} snippets={snippets.filter((x) => x.kind === "sms")} />
            </Card>
          )}

          {!dbg.includes("G") && comms.email && c.email && (
            <GmailComposer
              history={[...events].reverse().filter((e) => e.kind === "email").map((e) => { const b = stripHtml(e.body); return { body: b.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 400), inbound: b.startsWith("⬅"), at: e.at.toISOString(), actor: e.actor }; })}
              oppId={opp.id} contactId={c.id} to={c.email} leadName={c.name} rep={me!.name}
              fromLabel={`${me!.name} <${me!.name.split(" ")[0].toLowerCase()}@freedom-offers.com>`}
              signature={mySignature}
              snippets={snippets.filter((x) => x.kind === "email")}
            />
          )}

          <div id="timeline" className="scroll-mt-4 pl-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Timeline — everything, newest first</div>
          {events.map((e) => (
            <Card key={e.id} className={`flex gap-2.5 p-3 ${e.kind === "system" ? "opacity-70" : ""}`}>
              <span className="text-base">{KIND_EMOJI[e.kind] ?? "•"}</span>
              <div className="min-w-0 flex-1">
                {e.kind === "note"
                  ? (() => {
                      // 🪶 Notes render as pure server HTML (Jon 2026-10-26): the old per-note
                      // client editor × 50+ notes blew the page's client-component budget and
                      // aborted the stream on busy leads. Native <details> toggles the editor;
                      // the forms submit via server actions (progressive enhancement, no JS).
                      const rich = isHtmlNote(e.body);
                      const canEdit = e.actor === me!.name || manager;
                      return (
                        <div className="group/note">
                          {rich
                            ? <span className="text-[13px] text-slate-800 [&_a]:text-indigo-600 [&_a]:underline [&_b]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-bold [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5"><b>{e.actor}:</b> <span dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(e.body) }} /></span>
                            : <span className="whitespace-pre-line text-[13px] text-slate-800"><b>{e.actor}:</b> {e.body}</span>}
                          {canEdit && (
                            <details className="mt-0.5 text-[11px]">
                              <summary className="cursor-pointer font-bold text-slate-300 opacity-0 transition group-hover/note:opacity-100 hover:text-indigo-600">✎ edit / delete</summary>
                              <form action={editCrmNoteAction} className="mt-1 space-y-1.5">
                                <input type="hidden" name="id" value={e.id} />
                                <input type="hidden" name="oppId" value={opp.id} />
                                <textarea name="body" defaultValue={rich ? htmlNoteToText(e.body) : e.body} rows={3} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
                                <div className="flex items-center gap-1.5">
                                  <button className="rounded-lg bg-brand-navy px-3 py-1 text-[11px] font-bold text-white hover:opacity-90">Save</button>
                                </div>
                              </form>
                              <form action={deleteCrmNoteAction} className="mt-1">
                                <input type="hidden" name="id" value={e.id} />
                                <input type="hidden" name="oppId" value={opp.id} />
                                <button className="text-[11px] font-bold text-slate-300 hover:text-red-600">🗑 Delete this note</button>
                              </form>
                            </details>
                          )}
                        </div>
                      );
                    })()
                  : <div className="whitespace-pre-line text-[13px] text-slate-800"><b className="capitalize">{e.kind}</b> — {stripHtml(e.body)}</div>}
                {/* 🎙 recording → play it right here + collapsed full transcript
                    (the AI summary is its own 📝 note; Jon 2026-10-12/13) */}
                {(() => { const m = e.meta as { link?: string; transcript?: string } | null; if (!(m && e.body.startsWith("🎙"))) return null; return (
                  <div className="mt-1.5 space-y-1">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    {m.link && <audio controls preload="none" src={recStreamSrc(m.link)} className="h-9 w-full max-w-sm" />}
                    {/* ⚠️ Cap the inline transcript (Jon 2026-10-26): rendering every call's FULL
                        transcript inline on an active deal with many calls ballooned the page payload
                        past the function limit → "Connection closed". Show a preview; full text lives
                        in 🎧 Call Scoring. */}
                    {m.transcript && <details className="text-[11px]"><summary className="cursor-pointer font-bold text-slate-400 hover:text-slate-600">📄 Transcript preview</summary><div className="mt-1 max-h-60 overflow-y-auto whitespace-pre-line rounded-lg bg-slate-50 p-2 text-slate-600 ring-1 ring-slate-100">{m.transcript.slice(0, 1000)}{m.transcript.length > 1000 ? "\n\n…(preview — open the full transcript in 🎧 Call Scoring)" : ""}</div></details>}
                  </div>
                ); })()}
                {/* 📎 attached document (on a note or a file upload) → clickable link;
                    the file also lives in this lead's Documents (Jon 2026-10-21). */}
                {(() => { const m = e.meta as { link?: string; name?: string } | null; if (!(m && m.link && (e.kind === "note" || e.kind === "file")) || e.body.startsWith("🎙")) return null; return (
                  <a href={m.link} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] font-semibold text-sky-700 ring-1 ring-slate-200 hover:bg-slate-100">📎 {m.name || "Open document"}</a>
                ); })()}
                <div className="mt-0.5 text-[10px] text-slate-400">{fmtAt(e.at)}{e.actor && e.kind !== "note" ? ` · ${e.actor}` : ""}{e.oppId && e.oppId !== opp.id ? " · other opportunity" : ""}</div>
              </div>
            </Card>
          ))}
          {events.length === 0 && <Card className="p-6 text-center text-xs text-slate-400">Nothing yet — the first note starts the story.</Card>}
        </div>
        )}

        {/* ── RIGHT: the work — tasks, appointments, discovery, parties ── */}
        {!dbg.includes("R") && (
        <div className="order-3 flex min-w-0 flex-col gap-3 xl:order-none">
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">📝 Contracts</span>
            {PANDADOC_DRAFTING_ENABLED ? (<>
              <DraftOfferButton oppId={opp.id} kind="cash" label="💵 Draft cash offer" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700" />
              <DraftOfferButton oppId={opp.id} kind="novation" label="🏷 Draft novation offer" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700" />
              <span className="text-[10px] text-slate-400">drafts in PandaDoc with seller, address &amp; price pre-filled — link lands on the timeline. Moving to an offer stage auto-drafts cash (tag the lead <b>novation</b> first to flip it).</span>
            </>) : (
              <span className="text-[11px] text-slate-500">Auto-drafting is <b>off</b> — PandaDoc&apos;s API charges per document. Create the cash/novation contract directly in PandaDoc for this lead.</span>
            )}
          </Card>

          {/* 🔗 Deals this agent/developer is on — last talk + offer + next follow-up,
              all in one place on their card (Jon 2026-10-21). */}
          {leadDeals.length > 0 && (
            <Card className="p-3">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">📦 Deals {c.name.split(" ")[0]} is on ({leadDeals.length})</div>
              <div className="space-y-1.5">
                {leadDeals.map((d) => {
                  const overdue = d.nextFollowUp && d.nextFollowUp <= todayPT && d.stage !== "passed" && d.stage !== "offer_in";
                  return (
                    <a key={d.dealOppId} href={`/crm/${d.dealOppId}`} className={`block rounded-lg px-2.5 py-1.5 ring-1 ${overdue ? "bg-red-50 ring-red-200" : "bg-slate-50 ring-slate-100"} hover:bg-white`}>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 truncate text-[12px] font-bold text-slate-800">📦 {d.dealAddr}</span>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${stageMeta(d.stage).cls}`}>{stageMeta(d.stage).label}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                        {d.price && <span className="font-bold text-emerald-700">💵 offered {d.price}</span>}
                        {d.lastContact && <span>last talk {d.lastContact}</span>}
                        {d.nextFollowUp && <span className={overdue ? "font-bold text-red-600" : ""}>{overdue ? `⏰ follow up — was due ${d.nextFollowUp}` : `next ${d.nextFollowUp}`}</span>}
                      </div>
                    </a>
                  );
                })}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400">Everything {c.name.split(" ")[0]} is working — update it from each deal&apos;s 📇 Buyers &amp; agents panel.</div>
            </Card>
          )}

          {/* ⏭ Next best action — the one move that pushes this deal toward sold (Jon 2026-10-23) */}
          {showMatches && (() => {
            const offers = readDispoOffers(opp.formData);
            const st = offerStats(offers);
            const buyers = readDispoBuyers(opp.formData);
            const draft = readAssignmentDraft(opp.formData);
            const si = stages.findIndex((s) => s.key === opp.stage);
            const mRx = /sent to (buyer|agent)|on market|marketing|cascade|\bjvp\b/i;
            const mi = stages.findIndex((s) => mRx.test(s.label) || mRx.test(s.key));
            const out = si >= 0 && mi >= 0 && si >= mi;
            const closed = /won|closed|sold/i.test(opp.stage || "") && !/dead|died|nurtur|lost/i.test(opp.stage || "");
            const accepted = offers.some((o) => o.status === "accepted");
            const n = nextDispoAction({ closed, out, buyerCount: buyers.length, liveOffers: st.live, offerGoal: OFFER_GOAL, accepted, hasDraft: !!draft, sentForSignature: !!(draft?.sentAt || draft?.pandadocId), daysInStage: dealDaysInStage });
            const tone: Record<string, string> = { sky: "from-sky-500 to-sky-600", amber: "from-amber-500 to-amber-600", emerald: "from-emerald-500 to-emerald-600", indigo: "from-indigo-500 to-indigo-600", rose: "from-rose-500 to-rose-600", slate: "from-slate-500 to-slate-600" };
            return (
              <div className={`rounded-2xl bg-gradient-to-r ${tone[n.tone]} p-[1.5px]`}>
                <div className="rounded-[15px] bg-white px-4 py-3">
                  <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">⏭ Next step</div>
                  <div className="mt-0.5 flex items-start gap-2">
                    <span className="text-lg leading-tight">{n.icon}</span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-extrabold text-slate-900">{n.text}</div>
                      <div className="text-[12px] text-slate-500">{n.hint}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 🎯 Matching cash buyers — who to send this land to, ranked (marketing only) */}
          {showMatches && buyerMatches.length > 0 && (
            <Card className="p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">🎯 Matching cash buyers</span>
                <PanelGuard label="send-to-buyers"><SendToBuyersButton oppId={opp.id} launchReady={process.env.DIRECTREI_WRITE === "1" && Boolean(process.env.DIRECTREI_API_KEY)} /></PanelGuard>
              </div>
              <div className="space-y-1.5">
                {buyerMatches.map((b) => (
                  <div key={b.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-100">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-navy text-[10px] font-extrabold text-white">{b.rank}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-bold text-slate-800">{b.name}</span>
                        {b.fast && <span className="shrink-0 rounded bg-emerald-50 px-1 text-[9px] font-bold text-emerald-700">fast</span>}
                        {b.topPrice != null && <span className="shrink-0 text-[10px] font-semibold text-slate-400">to ${Math.round(b.topPrice / 1000)}k</span>}
                      </div>
                      {b.reasons.length > 0 && <div className="truncate text-[10px] text-slate-500">{b.reasons.join(" · ")}</div>}
                      {(b.phone || b.email) && <div className="truncate text-[10px] font-semibold text-slate-400">{b.phone}{b.phone && b.email ? " · " : ""}{b.email}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400">Ranked by area + price fit from your vetted buyers. Send top-down.</div>
            </Card>
          )}

          {/* 🎯 Smart Match from the buyer-network CRM — auto-ranked developers +
              agents for THIS deal; one-click attach (Jon 2026-10-20). */}
          {showMatches && networkMatches.length > 0 && (
            <Card className="p-3">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">🎯 Smart Match — your network buys here</div>
              <div className="space-y-1.5">
                {networkMatches.map((m, i) => {
                  const attached = attachedBuyerIds.has(m.oppId);
                  return (
                    <div key={m.oppId} className="flex items-start gap-2 rounded-lg bg-emerald-50/50 px-2.5 py-1.5 ring-1 ring-emerald-100">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-[10px] font-extrabold text-white">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 text-[11px]">{m.kind === "buyer_agent" ? "🧑‍💼" : "🏗"}</span>
                          <a href={`/crm/${m.oppId}`} className="truncate text-[12px] font-bold text-slate-800 hover:text-emerald-700 hover:underline">{m.name}</a>
                        </div>
                        {m.reason && <div className="truncate text-[10px] text-emerald-700">{m.reason}</div>}
                        {m.phone && <div className="truncate text-[10px] font-semibold text-slate-400">{m.phone}</div>}
                      </div>
                      {attached
                        ? <span className="mt-0.5 shrink-0 text-[10px] font-bold text-emerald-600">✓ on deal</span>
                        : (
                          <form action={attachNetworkBuyerToDeal} className="mt-0.5 shrink-0">
                            <input type="hidden" name="oppId" value={opp.id} /><input type="hidden" name="networkOppId" value={m.oppId} />
                            <button className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700">＋ Attach</button>
                          </form>
                        )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400">Auto-matched from your developer + agent network by area. Attach to start the follow-up.</div>
            </Card>
          )}

          {/* 🚦 Option B — SOP gate wired into the pipeline; advance is blocked until it clears (Jon 2026-10-21) */}
          {showMatches && (
            <PanelGuard label="gate"><DispoGatePanel oppId={opp.id} pipeline={opp.pipeline || ""} currentStage={opp.stage} stages={stages.map((s) => ({ key: s.key, label: s.label }))} checks={readGateChecks(opp.formData)} /></PanelGuard>
          )}

          {/* 📣 Marketing SOP checklist — dispo deals only (Jon 2026-10-20) */}
          {showMatches && (
            <PanelGuard label="marketing"><DispoMarketingChecklist oppId={opp.id} done={readMarketingDone(opp.formData)} /></PanelGuard>
          )}

          {/* ⚡ One-click cascade — attach the top matched developers + agents so the
              deal goes out to more buyers fast (Jon 2026-10-21) */}
          {showMatches && (
            <form action={runDispoCascadeAction}>
              <input type="hidden" name="oppId" value={opp.id} />
              <button className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700" title="Attach the top matched vetted developers + buyer agents to this deal's tracker, ready to work">⚡ Run the cascade — attach top matched buyers</button>
            </form>
          )}

          {/* 📇 Per-deal buyer/agent follow-up tracker — dispo reps only; shows buyer names (Jon 2026-10-21) */}
          {showMatches && (
            <PanelGuard label="buyer-tracker"><DispoBuyerTracker oppId={opp.id} buyers={await withTimeout(enrichDispoBuyers(readDispoBuyers(opp.formData)), 8000, readDispoBuyers(opp.formData))} today={new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })} canCall={comms.call} canSms={comms.sms} /></PanelGuard>
          )}

          {/* 💰 Offers received — the 3-offer accountability tracker (Jon 2026-10-22) */}
          {showMatches && (() => {
            const si = stages.findIndex((s) => s.key === opp.stage);
            const mi = stages.findIndex((s) => /sent to (buyer|agent)|on market|marketing|cascade|\bjvp\b/i.test(s.label) || /sent to (buyer|agent)|on market|marketing|cascade|\bjvp\b/i.test(s.key));
            const pastCascade = si >= 0 && mi >= 0 && si >= mi;
            return <PanelGuard label="offers"><DispoOffersPanel oppId={opp.id} offers={readDispoOffers(opp.formData)} buyerNames={readDispoBuyers(opp.formData).map((b) => b.name)} pastCascade={pastCascade} askPrice={opp.askPrice ?? null} /></PanelGuard>;
          })()}

          {/* 📄 Assignment contract auto-draft — build it from the deal's own numbers (Jon 2026-10-22) */}
          {showMatches && (() => {
            const offers = readDispoOffers(opp.formData);
            const st = offerStats(offers);
            const fd = (opp.formData ?? {}) as Record<string, unknown>;
            const ff = (k: string): string => {
              for (const sec of Object.values(fd)) {
                if (sec && typeof sec === "object" && !Array.isArray(sec) && k in (sec as Record<string, unknown>)) {
                  const v = (sec as Record<string, unknown>)[k];
                  if (v) return String(Array.isArray(v) ? v.join(", ") : v);
                }
              }
              return "";
            };
            const best = st.best ?? 0;
            const sellerPrice = parseMoney(ff("sellerNumber")) ?? parseMoney(ff("ourOffer")) ?? opp.askPrice ?? (best ? Math.round((best * 0.8) / 500) * 500 : 0);
            const fee = best > 0 && sellerPrice > 0 ? Math.max(0, best - sellerPrice) : 0;
            const accepted = offers.find((o) => o.status === "accepted");
            const assigneeNm = accepted?.buyer || st.bestBuyer || "";
            const matchBuyer = readDispoBuyers(opp.formData).find((b) => b.name && assigneeNm && b.name.toLowerCase() === assigneeNm.toLowerCase());
            const pandadocReady = Boolean(process.env.PANDADOC_DRAFTING === "1" && process.env.PANDADOC_TEMPLATE_ASSIGNMENT);
            const propAddr = opp.title && !/^\s*$/.test(opp.title) ? opp.title : (ff("address") || c.address || "");
            const stMatch = /,\s*([A-Z]{2})\s*\d{0,5}\s*$/.exec(propAddr);
            const defaults = {
              assignorEntity: "Freedom Offers LLC", assignorSigner: me?.name || "",
              assigneeName: accepted?.buyer || st.bestBuyer || "", assigneeEntity: "", assigneeEmail: "",
              propertyAddress: propAddr, apn: ff("apn") || ((opp.formData as { property?: { apn?: string } } | null)?.property?.apn ?? ""),
              county: "", state: stMatch ? stMatch[1] : "", acres: ff("acreage"),
              purchasePrice: sellerPrice || 0, assignmentFee: fee, emd: 0,
              closingDays: 30, titleCompany: "",
              effectiveDate: new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }),
            };
            return <PanelGuard label="assignment"><AssignmentContractPanel oppId={opp.id} defaults={defaults} draft={readAssignmentDraft(opp.formData)} pandadocReady={pandadocReady} canSms={comms.sms} assigneePhone={matchBuyer?.phone || ""} /></PanelGuard>;
          })()}

          {comms.email && c.email && (
            <Card className="p-0">
              <details className="group" open={!!enrolled}>
                <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">📧 Sequences</span>
                  {enrolled && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">▶ running</span>}
                  <span className="ml-auto text-slate-300 transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3">
                  {enrolled ? (
                    <>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        ▶ {sequences.find((x) => x.id === enrolled.seqId)?.name ?? enrolled.seqId} — step {enrolled.step + 1}, next {enrolled.nextYmd}
                      </span>
                      <span className="text-[10px] text-slate-400">auto-stops the moment they reply</span>
                      <form action={unenrollSequenceAction} className="ml-auto">
                        <input type="hidden" name="oppId" value={opp.id} />
                        <input type="hidden" name="contactId" value={c.id} />
                        <button className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">⏹ stop</button>
                      </form>
                    </>
                  ) : (
                    <form action={enrollSequenceAction} className="flex flex-1 flex-wrap items-center gap-1.5">
                      <input type="hidden" name="oppId" value={opp.id} />
                      <input type="hidden" name="contactId" value={c.id} />
                      <input type="hidden" name="email" value={c.email} />
                      <select name="seqId" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold">
                        {sequences.map((sq) => <option key={sq.id} value={sq.id}>{sq.name} ({sq.steps.length} emails)</option>)}
                      </select>
                      <button className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700">▶ Enroll</button>
                      <span className="text-[10px] text-slate-400">like Direct REI's drip — ours, free, stops on reply</span>
                    </form>
                  )}
                </div>
              </details>
            </Card>
          )}

          {/* tasks */}
          <Card className="p-4">
            <div id="tasks" className="mb-1.5 scroll-mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">⏰ Tasks</div>
            <div className="space-y-1.5">
              {tasks.map((t) => (
                <form key={t.id} action={toggleCrmTaskAction} className="flex items-center gap-2 text-sm">
                  <input type="hidden" name="id" value={t.id} />
                  <button className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-bold ring-1 ${t.doneAt ? "bg-emerald-500 text-white ring-emerald-600" : "bg-white text-transparent ring-slate-300 hover:ring-emerald-400"}`}>✓</button>
                  <span className={t.doneAt ? "text-slate-400 line-through" : "font-semibold text-slate-700"}>{t.title}</span>
                  {t.due && !t.doneAt && <span className={`ml-auto text-[10px] font-bold ${t.due.slice(0, 10) <= new Date().toISOString().slice(0, 10) ? "text-red-600" : "text-slate-400"}`}>{t.due.slice(0, 10)}</span>}
                  {t.assignedTo && <span className="text-[10px] text-slate-400">{t.assignedTo.split(" ")[0]}</span>}
                </form>
              ))}
              {tasks.length === 0 && <p className="text-xs text-slate-400">No tasks yet.</p>}
            </div>
            <form action={addCrmTaskAction} className="mt-2 flex flex-wrap gap-1.5">
              <input type="hidden" name="oppId" value={opp.id} />
              <input type="hidden" name="contactId" value={c.id} />
              <input name="title" placeholder="＋ task…" required className="min-w-[140px] flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <input type="date" name="due" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <select name="assignedTo" defaultValue={me?.name ?? ""} className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs">
                {reps.map((r) => <option key={r.id} value={r.name}>{r.name.split(" ")[0]}</option>)}
              </select>
              <button className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">Add</button>
            </form>
          </Card>

          {/* 📋 Discovery forms — the GHL custom-field sections, simplified */}
          <Card className="p-4" id="discovery">
            <details>
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-slate-400">📋 Discovery — fill as you talk <span className="normal-case text-slate-300">(click to open)</span></summary>
            {(() => {
              const fd = (opp.formData ?? {}) as Record<string, Record<string, string | string[]>>;
              // Forms follow the pipeline (= lead type): sellers get seller discovery,
              // developers/buyer agents get their buy-box/agent form (Jon 2026-10-20).
              return formsForPipeline(opp.pipeline).map((form) => {
                const answers = fd[form.key] ?? {};
                const count = Object.keys(answers).length;
                return (
                  <details key={form.key} className="mb-1.5 rounded-xl bg-slate-50 ring-1 ring-slate-100" open={count > 0 && count < form.fields.length}>
                    <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">
                      {form.emoji} {form.name}
                      <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${count ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{count}/{form.fields.length}</span>
                    </summary>
                    <AutoSaveForm action={saveCrmFormAction} className="space-y-2 px-3 pb-3">
                      <input type="hidden" name="oppId" value={opp.id} />
                      <input type="hidden" name="contactId" value={c.id} />
                      <input type="hidden" name="formKey" value={form.key} />
                      {form.fields.map((f) => (
                        <label key={f.key} className="block">
                          <span className={lbl}>{f.label}</span>
                          {f.type === "text" && <input name={`f_${f.key}`} defaultValue={(answers[f.key] as string) ?? ""} placeholder={f.hint ?? ""} className={inputCls} />}
                          {f.type === "textarea" && <textarea name={`f_${f.key}`} rows={2} defaultValue={(answers[f.key] as string) ?? ""} placeholder={f.hint ?? ""} className={inputCls} />}
                          {f.type === "select" && (
                            <select name={`f_${f.key}`} defaultValue={(answers[f.key] as string) ?? ""} className={inputCls}>
                              <option value="">—</option>
                              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          )}
                          {f.type === "checks" && (
                            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                              {f.options.map((o) => (
                                <label key={o} className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                                  <input type="checkbox" name={`f_${f.key}`} value={o} defaultChecked={Array.isArray(answers[f.key]) && (answers[f.key] as string[]).includes(o)} /> {o}
                                </label>
                              ))}
                            </span>
                          )}
                        </label>
                      ))}
                      <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">Save {form.name}</button>
                    </AutoSaveForm>
                  </details>
                );
              });
            })()}
            </details>
          </Card>

          {/* parties in the deal */}
          <Card className="p-4">
            <details id="parties" className="scroll-mt-4">
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-slate-400">🤝 Parties in this deal <span className="normal-case text-slate-300">(click to open)</span></summary>
            <div className="space-y-1.5">
              {parties.map((p) => (
                <div key={p.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs ring-1 ring-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500 ring-1 ring-slate-200">{p.role || "party"}</span>
                    <span className="font-bold text-slate-800">{p.name}</span>
                    <form action={deleteCrmPartyAction} className="ml-auto"><input type="hidden" name="id" value={p.id} /><button className="text-[10px] text-slate-300 hover:text-red-500">✕</button></form>
                  </div>
                  <div className="mt-0.5 text-[11px] text-brand-navy">{[p.phone, p.email].filter(Boolean).join(" · ")}</div>
                  {p.note && <div className="text-[10px] text-slate-400">{p.note}</div>}
                </div>
              ))}
              {parties.length === 0 && <p className="text-xs text-slate-400">No one attached yet — listing agent, escrow, title, attorney…</p>}
            </div>
            <form action={addCrmPartyAction} className="mt-2 grid grid-cols-2 gap-1.5">
              <input type="hidden" name="oppId" value={opp.id} />
              <select name="role" className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                <option value="listing agent">listing agent</option>
                <option value="buyer agent">buyer agent</option>
                <option value="escrow">escrow</option>
                <option value="title">title</option>
                <option value="attorney">attorney</option>
                <option value="JV partner">JV partner</option>
                <option value="other">other</option>
              </select>
              <input name="name" placeholder="Name *" required className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <input name="phone" placeholder="Phone" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <input name="email" placeholder="Email" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <input name="note" placeholder="Note (company, file #…)" className="col-span-2 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <button className="col-span-2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white">＋ Attach party</button>
            </form>
            </details>
          </Card>

          {/* appointments */}
          <Card className="p-4">
            <div id="appts" className="mb-1.5 scroll-mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">📅 Appointments <span className="normal-case text-slate-300">(alarm posts to the huddle chat ~1h before)</span></div>
            <div className="space-y-1.5">
              {appts.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg bg-indigo-50/70 px-2.5 py-1.5 text-xs ring-1 ring-indigo-100">
                  <span className="font-bold text-indigo-800">{fmtAt(a.at)}</span>
                  <span className="font-semibold text-slate-700">{a.title}</span>
                  <span className="text-slate-400">· {a.withWho}</span>
                  <form action={deleteCrmApptAction} className="ml-auto"><input type="hidden" name="id" value={a.id} /><button className="text-[10px] text-slate-300 hover:text-red-500">✕</button></form>
                </div>
              ))}
              {appts.length === 0 && <p className="text-xs text-slate-400">Nothing booked.</p>}
            </div>
            <form action={addCrmApptAction} className="mt-2 flex flex-wrap gap-1.5">
              <input type="hidden" name="oppId" value={opp.id} />
              <input type="hidden" name="contactId" value={c.id} />
              <input name="title" placeholder="＋ offer call…" required className="min-w-[120px] flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
<select name="aptType" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold">
                <option value="phone">📞 Phone apt</option>
                <option value="inperson">🤝 In person apt</option>
              </select>
              <select name="purpose" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold">
                <option value="Process call">Process call</option>
                <option value="Offer call">Offer call</option>
                <option value="Negotiation">Negotiation</option>
                <option value="Follow-up info">Follow-up info</option>
                <option value="Inspection / photos">Inspection / photos</option>
                <option value="Contract signing">Contract signing</option>
                <option value="custom">✏️ Custom…</option>
              </select>
              <input name="purposeCustom" placeholder="custom purpose (if ✏️)" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <input type="datetime-local" name="at" required className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <button className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">Book</button>
            </form>
          </Card>
        </div>
        )}
      </div>
    </div>
    </PanelGuard>
  );
}

// 🔧 TEMPORARY DIAGNOSTIC (Jon 2026-10-26: "contact in full isn't working" on EVERY
// contact). Production redacts server-component error messages to a digest, so we wrap
// the render to surface the real error/stack on-screen. REMOVE once the root cause is fixed.
export default async function OpportunityPage(props: { params: Promise<{ oppId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  try {
    return await OpportunityPageInner(props);
  } catch (e) {
    const err = e as Error;
    return (
      <pre style={{ whiteSpace: "pre-wrap", padding: 16, fontSize: 12, color: "#b91c1c", fontFamily: "ui-monospace, monospace", background: "#fff1f2", borderRadius: 12, margin: 16 }}>
        {"⚠️ Contact page error (temporary diagnostic — fixing this now):\n\n"}
        {(err?.message || String(e)) + "\n\n"}
        {err?.stack || ""}
      </pre>
    );
  }
}
