"use server";
// Acquisitions CRM actions (Jon 2026-10-07). Access = acquisitions reps +
// managers (same people who could touch these leads in GHL).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { logCrmEvent, CRM_STAGES, readPipelines } from "@/lib/crm";

async function crmUser() {
  const me = await getCurrentUser();
  if (!me) return null;
  if (isManager(me) || me.position === "acquisitions" || me.position === "cc_lm" || me.position === "dispositions") return me;
  return null;
}

/** Quick add: contact + first opportunity in one form. */
export async function createCrmLeadAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const name = String(formData.get("name") ?? "").trim();
  // v2 form (Jon 2026-10-09): explicit street/city/state/zip fields, scrubbed
  // through normalizeAddress as the final check before the card exists.
  const { normalizeAddress } = await import("@/lib/address");
  const street = String(formData.get("street") ?? "").trim();
  const addrJoined = [street, String(formData.get("city") ?? "").trim(), `${String(formData.get("state") ?? "").trim()} ${String(formData.get("zip") ?? "").trim()}`.trim()].filter(Boolean).join(", ");
  const title = normalizeAddress(addrJoined || String(formData.get("title") ?? "").trim()) || "New opportunity";
  const notes = String(formData.get("notes") ?? "").trim();
  if (!name) return;
  // phone saved as E.164 — "(909) 395-6195" raw broke the welcome text,
  // Telnyx rejects anything that isn't +1XXXXXXXXXX (Jon 2026-10-09)
  // toE164US (crm-shared) also survives spreadsheet floats like "3056076099.0"
  // which the old strip-then-last-10 turned into a WRONG number (2026-10-19).
  const { toE164US } = await import("@/lib/crm-shared");
  const rawPhoneIn = String(formData.get("phone") ?? "").trim();
  const rawPhone = toE164US(rawPhoneIn) || rawPhoneIn.replace(/[^+\d]/g, "");
  const p10 = rawPhone.replace(/\D/g, "").slice(-10);
  const emailIn = String(formData.get("email") ?? "").trim();
  // 🔁 Dedupe at the door (crm-enhancer 2026-10-18): the nightly audit keeps
  // finding the same seller as two contacts (26 phone-duplicate groups) = two
  // reps calling one person. If a LIVE contact already has this phone (last 10,
  // main or alt) or this email, hang the new property off THAT contact instead
  // of creating a twin. Blanks on the existing card get filled in; nothing is
  // overwritten. Welcome text/email are SKIPPED for a known seller (they were
  // already welcomed — re-sending reads as spam).
  const existing = (p10.length === 10 || emailIn)
    ? await db.crmContact.findFirst({
        where: { archivedAt: null, OR: [
          ...(p10.length === 10 ? [{ phone: { endsWith: p10 } }, { altPhone: { endsWith: p10 } }] : []),
          ...(emailIn ? [{ email: { equals: emailIn, mode: "insensitive" as const } }] : []),
        ] },
        orderBy: { updatedAt: "desc" },
      }).catch(() => null)
    : null;
  const contact = existing
    ? await db.crmContact.update({ where: { id: existing.id }, data: {
        ...(existing.email ? {} : emailIn ? { email: emailIn } : {}),
        ...(existing.address || title === "New opportunity" ? {} : { address: title }),
        ...(existing.source ? {} : { source: String(formData.get("source") ?? "").trim() }),
        ...(existing.assignedTo ? {} : { assignedTo: String(formData.get("assignedTo") ?? "").trim() || me.name }),
      } })
    : await db.crmContact.create({ data: {
        name,
        phone: rawPhone ? (rawPhone.startsWith("+") ? rawPhone : p10.length === 10 ? `+1${p10}` : rawPhone) : "",
        email: emailIn,
        source: String(formData.get("source") ?? "").trim(),
        assignedTo: String(formData.get("assignedTo") ?? "").trim() || me.name,
        address: title === "New opportunity" ? "" : title,
      } });
  // land in the ASSIGNED REP'S pipeline; if that rep has no pipeline (e.g. a
  // dispo rep or unassigned) default to MICHELLE's acquisitions pipeline, NEVER
  // the generic War Room tab (Jon 2026-10-13). Fire welcome SMS + email too.
  const pls = await readPipelines();
  const repFirst = contact.assignedTo.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const repPipe = repFirst ? pls.find((p) => p.name.toLowerCase().includes(repFirst)) : undefined;
  const michellePipe = pls.find((p) => /michelle/i.test(p.name));
  const landPipe = repPipe ?? michellePipe;
  const owner = repPipe ? contact.assignedTo : (michellePipe ? "Michelle Lagudas" : contact.assignedTo);
  if (!repPipe && michellePipe && owner !== contact.assignedTo) {
    await db.crmContact.update({ where: { id: contact.id }, data: { assignedTo: owner } }).catch(() => {});
  }
  // 🔁 Don't spawn a duplicate CARD for a contact who already has an OPEN card for
  // the same property — or when this entry has no real address yet. Repeated "New
  // lead" submits + the revive-dead "undefined" import were making several cards for
  // one person (Jon 2026-10-21). A genuinely different address still makes its own card.
  const placeholderTitle = !title || title === "New opportunity" || /^undefined$/i.test(title);
  const dupeOpp = existing
    ? await db.crmOpportunity.findFirst({
        where: { contactId: contact.id, archivedAt: null, stage: { notIn: ["dead", "signed"] },
          ...(placeholderTitle ? {} : { title: { equals: title, mode: "insensitive" } }) },
        orderBy: { updatedAt: "desc" },
      }).catch(() => null)
    : null;
  const opp = dupeOpp ?? await db.crmOpportunity.create({ data: {
    contactId: contact.id, title, stage: landPipe?.stages[0]?.key ?? "new", pipeline: landPipe?.name ?? "",
    assignedTo: owner,
  } });
  await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: dupeOpp
    ? `Lead entry matched an existing open card${placeholderTitle ? " (no new address given)" : ` for ${title}`} — no duplicate card made`
    : existing
    ? `Lead created — matched EXISTING contact "${existing.name}" by ${p10.length === 10 && (existing.phone.endsWith(p10) || existing.altPhone.endsWith(p10)) ? "phone" : "email"} (no duplicate contact made${name && name.toLowerCase() !== existing.name.toLowerCase() ? `; entered as "${name}"` : ""})`
    : "Lead created", actor: me.name });
  // 📞 speed-to-lead: an immediate call task so a brand-new lead is worked now,
  // then ?newleadnudge keeps nudging every few hours until reached (Jon 2026-10-13)
  const todayPT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  await db.crmTask.create({ data: { oppId: opp.id, contactId: contact.id, title: `📞 Call now — new lead ${contact.name.split(" ")[0]}`, due: todayPT, assignedTo: owner, createdBy: "newlead-nudge" } }).catch(() => {});
  // intake notes land on the timeline immediately — no second step (Jon 2026-10-09)
  if (notes) await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "note", body: notes.slice(0, 4000), actor: me.name });
  if (contact.phone && !existing) {
    const { sendWelcomeText } = await import("@/lib/website-lead");
    sendWelcomeText({ contactId: contact.id, oppId: opp.id, phone: contact.phone, name: contact.name, repName: contact.assignedTo }).catch(() => {});
  }
  if (contact.email && !existing) {
    (async () => {
      const { sendEmailTo } = await import("@/lib/notify");
      const { readMsgTemplates, fillTokens } = await import("@/lib/msg-templates");
      const tpls = await readMsgTemplates();
      const tok = { first: contact.name.split(" ")[0], rep: contact.assignedTo.split(" ")[0], address: title };
      const subj = fillTokens(tpls.welcome_email_subject, tok);
      const html = fillTokens(tpls.welcome_email_body, tok);
      const ok = await sendEmailTo([contact.email], subj, html);
      // 📧 log the FULL email (subject + body) so the thread shows what the seller
      // actually received, not just "welcome email" (Jon 2026-10-13).
      const plain = html.replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
      await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "email", body: `➡️ Us: ✉️ ${subj}\n\n${plain}${ok ? "" : "\n\n(SEND FAILED)"}`, actor: "auto-welcome" }).catch(() => {});
    })().catch(() => {});
  }
  revalidatePath("/crm");
  redirect(`/crm/${opp.id}`);
}

/** Add another opportunity to an existing contact (multi-opp per contact). */
export async function addOpportunityAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const contactId = String(formData.get("contactId") ?? "");
  const apn = String(formData.get("apn") ?? "").trim();
  const { formatAddress } = await import("@/lib/address");
  const title = formatAddress(String(formData.get("title") ?? "")) || (apn ? `APN ${apn}` : "");
  if (!contactId || !title) return;
  const opp = await db.crmOpportunity.create({ data: { contactId, title, stage: "new", assignedTo: me.name, ...(apn ? { formData: { property: { apn } } } : {}) } });
  await logCrmEvent({ contactId, oppId: opp.id, kind: "system", body: `New opportunity: ${title}${apn ? ` · APN ${apn}` : ""}`, actor: me.name });
  revalidatePath("/crm");
  redirect(`/crm/${opp.id}`);
}

export async function setOppStageAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage") ?? "");
  const pipes = await readPipelines();
  const valid = pipes.some((p) => p.stages.some((st) => st.key === stage));
  if (!id || !valid) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id }, select: { contactId: true, stage: true, pipeline: true, formData: true } });
  if (!opp || opp.stage === stage) return;
  // 🚦 Option B gate enforcement (Jon 2026-10-21): on a dispo deal, don't let it move
  // FORWARD to a later stage until the gate guarding its current stage is cleared.
  {
    const { isDispoDealPipeline } = await import("@/lib/dispo-buyers");
    if (isDispoDealPipeline(opp.pipeline)) {
      const { pathForPipeline, readGateChecks, stageMoveBlocked } = await import("@/lib/dispo-gates");
      const path = pathForPipeline(opp.pipeline);
      const stages = pipes.find((p) => p.name === opp.pipeline)?.stages.map((s) => ({ key: s.key, label: s.label })) ?? [];
      const block = stageMoveBlocked(path, stages, opp.stage, stage, readGateChecks(opp.formData));
      if (block.blocked && block.gate) {
        // 👑 Manager override (Jon 2026-10-26: "always allow a manager to override it" — e.g.
        // a mis-filed lead that shouldn't be stuck behind a gate). Logged so it's auditable.
        if (isManager(me)) {
          await logCrmEvent({ contactId: opp.contactId, oppId: id, kind: "system", body: `👑 ${me.name.split(" ")[0]} moved this past the gate “${block.gate.label}” (manager override).`, actor: me.name });
        } else {
          await logCrmEvent({ contactId: opp.contactId, oppId: id, kind: "system", body: `🔒 Stage held — clear the gate “${block.gate.label}” before advancing. (Option B: the SOP gate for this stage isn't complete.)`, actor: me.name });
          revalidatePath(`/crm/${id}`); revalidatePath("/crm"); revalidatePath("/dispo"); // snap the board card back
          return; // refuse the forward move
        }
      }
    }
  }
  await db.crmOpportunity.update({ where: { id }, data: {
    stage,
    ...(stage === "at_developers" ? { devPricingSentAt: new Date() } : {}),
    ...(stage === "dead" ? { archivedAt: new Date() } : { archivedAt: null }),
  } });
  await logCrmEvent({ contactId: opp.contactId, oppId: id, kind: "stage", body: `${opp.stage} → ${stage}`, actor: me.name });
  // ⚙️ fire matching automations (never blocks the move)
  const full = await db.crmOpportunity.findUnique({ where: { id }, select: { id: true, contactId: true, pipeline: true, stage: true, assignedTo: true, title: true, value: true, askPrice: true } });
  if (full) { const { runStageAutomations } = await import("@/lib/crm-automations"); runStageAutomations(full).catch(() => {}); }
  // 📝 GHL-parity (Jon 2026-10-07): hitting an offer/contract stage auto-drafts
  // the PandaDoc contract so the rep just reviews and sends. Never blocks.
  if (full && /offer|contract/i.test(stage) && !/rejected|sent|comp/i.test(stage)) {
    // cash unless the lead is tagged novation (buttons on the card override)
    const kind = /novation/i.test((await db.crmOpportunity.findUnique({ where: { id }, select: { tags: true } }))?.tags ?? "") ? "novation" : "cash";
    draftContract(full.id, kind, me.name).catch(() => {});
  }
  // 🧮 Comping workflow (Jon 2026-10-07): the three comp stages wire acq ↔
  // dispo ↔ underwriting together instead of sitting dead on the board.
  if (full) {
    (async () => {
      const contact = await db.crmContact.findUnique({ where: { id: full.contactId }, select: { name: true, address: true } });
      const addr = contact?.address ?? "";
      const today = new Date().toISOString().slice(0, 10);
      if (/comp.to.offer/i.test(stage)) {
        // one merged comp stage (2026-10-08 streamline) fires the whole flow:
        // acq underwrites NOW + dispo prices with developers + acq calls back.
        // (The old /comp to offer/ space-regexes never matched the slug keys.)
        // ⏰ Reminders (Jon 2026-10-20): comp within 15 min, offer SAME DAY — leads
        // must not sit here >1 day. Give the tasks real times so the pop-up fires.
        const { setTaskTime } = await import("@/lib/task-times");
        const hhmm = (ms: number) => new Date(Date.now() + ms).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour12: false, hour: "2-digit", minute: "2-digit" });
        const uw = await db.crmTask.create({ data: { oppId: full.id, contactId: full.contactId, title: `🧮 UNDERWRITE NOW (15-min clock) — ${contact?.name ?? "lead"}`, due: today, assignedTo: full.assignedTo || me.name, createdBy: "comp-flow" } }).catch(() => null);
        if (uw) await setTaskTime(uw.id, hhmm(15 * 60000)).catch(() => {});
        const offer = await db.crmTask.create({ data: { oppId: full.id, contactId: full.contactId, title: `📞 MAKE THE OFFER TODAY — ${contact?.name ?? "lead"} (comp → offer, same-day)`, due: today, assignedTo: full.assignedTo || me.name, createdBy: "comp-flow" } }).catch(() => null);
        if (offer) await setTaskTime(offer.id, hhmm(3 * 3600000)).catch(() => {}); // nudge ~3h later to get the offer out same day
        const dispo = await db.user.findFirst({ where: { active: true, position: "dispositions" }, select: { name: true } });
        await db.crmTask.create({ data: { oppId: full.id, contactId: full.contactId, title: `💰 PRICE CHECK w/ developers — ${contact?.name ?? "lead"}${addr ? ` (${addr})` : ""} → tell ${(full.assignedTo || me.name).split(" ")[0]} the number`, due: today, assignedTo: dispo?.name ?? "", createdBy: "comp-flow" } }).catch(() => {});
        await logCrmEvent({ contactId: full.contactId, oppId: full.id, kind: "system", body: `🧮 Comp → Offer (24h clock): underwrite now (/underwriting${addr ? `?address=${encodeURIComponent(addr)}` : ""}) · dispo pricing task created`, actor: "comp-flow" });
      }
      // 📣 Chat-space bells (Jon 2026-10-08): signed → Contracts Signed room;
      // deal won → whole-team room; offer stages → acquisitions room.
      try {
        const { postToSpace } = await import("@/lib/chat-spaces");
        if (/contract_signed/i.test(stage)) {
          postToSpace("contracts", `🖊 CONTRACT SIGNED — ${contact?.name ?? "seller"}${addr ? ` · ${addr}` : ""} · by ${(full.assignedTo || me.name)}${full.value != null ? ` · $${full.value.toLocaleString()}` : ""} 🎉`).catch(() => {});
          // 📦 DISPO SPEED (Jon 2026-10-13 roadmap): the moment a deal is signed,
          // hand it to dispositions with a kickoff task so it goes to cash buyers
          // in seconds, not days. (Human arms the cascade — no auto-outreach.)
          (async () => {
            const dispoRep = await db.user.findFirst({ where: { active: true, position: "dispositions" }, select: { name: true } });
            await db.crmTask.create({ data: { oppId: full.id, contactId: full.contactId, title: `📦 SEND TO BUYERS NOW — ${addr || contact?.name || "signed deal"} is signed. Build the deal + arm the buyer cascade.`, due: today, assignedTo: dispoRep?.name ?? "", createdBy: "dispo-speed" } });
            await logCrmEvent({ contactId: full.contactId, oppId: full.id, kind: "system", body: "📦 Dispo kickoff task created — get this signed deal to cash buyers fast (arm the cascade).", actor: "dispo-speed" });
          })().catch(() => {});
          // 📧 auto-create the Gmail deal label + filter in every teammate's
          // inbox (live once the gmail.labels/settings scopes are on the DWD)
          if (addr) {
            (async () => {
              const { rolloutDealLabel } = await import("@/lib/gmail-admin");
              const res = await rolloutDealLabel(addr);
              const ok = Object.values(res).filter((v) => v.startsWith("✓")).length;
              await logCrmEvent({ contactId: full.contactId, oppId: full.id, kind: "system", body: ok ? `📧 Gmail deal label + filter created in ${ok} inboxes for "${addr.split(",")[0]}"` : `📧 Gmail label rollout waiting on the DWD scopes (${Object.values(res)[0] ?? ""})`, actor: "gmail-labels" });
            })().catch(() => {});
          }
        }
        // 🏆 Won/closed stage — match the KEY or the LABEL (Jon renamed the stage to
        // "Closed / Won" → key "closed_won", which the old /deal_won/ test missed, so
        // closed deals stopped reaching the Deals board — Jon 2026-10-24).
        const wonLabel = pipes.find((p) => p.name === full.pipeline)?.stages.find((s) => s.key === stage)?.label ?? "";
        const isWonStage = (/won/i.test(stage) || /won/i.test(wonLabel)) && !/dead|died|lost|nurtur/i.test(stage) && !/dead|died|lost|nurtur/i.test(wonLabel);
        if (isWonStage) {
          postToSpace("contracts", `💰 DEAL WON (escrow closed) — ${contact?.name ?? "deal"}${addr ? ` · ${addr}` : ""}${full.value != null ? ` · $${full.value.toLocaleString()}` : ""}`).catch(() => {});
          postToSpace("team", `💰🎉 WE CLOSED A DEAL! ${addr || contact?.name || ""}${full.value != null ? ` — $${full.value.toLocaleString()}` : ""} — congrats team!`).catch(() => {});
          // 🏆 P4 (Jon 2026-10-20): the Deals board is now closed-won only, GENERATED
          // from a dispo deal hitting DEAL WON. Dedup with a formData flag so a bump
          // in/out of the stage never double-creates (which would double-count revenue).
          // Uses isDispoDealPipeline (works with emoji-prefixed names, unlike the old
          // isDispoPipeline ^ds anchor).
          const { isDispoDealPipeline } = await import("@/lib/dispo-buyers");
          if (isDispoDealPipeline(full.pipeline)) {
            const oppRow = await db.crmOpportunity.findUnique({ where: { id: full.id }, select: { formData: true } });
            const fd2 = (oppRow?.formData ?? {}) as Record<string, unknown>;
            if (!fd2.__dealGenerated) {
              const dealAddr = addr || contact?.name || full.title || "Deal";
              await db.deal.create({ data: { address: dealAddr, status: "closed", assignedTo: full.assignedTo || me.name, soldPrice: full.value ?? full.askPrice ?? null, assignmentFee: full.value ?? null, soldDate: today, source: "dispo-crm", notes: `Auto-generated from ${full.pipeline} → DEAL WON.` } }).catch(() => {});
              await db.crmOpportunity.update({ where: { id: full.id }, data: { formData: { ...fd2, __dealGenerated: today } as never } }).catch(() => {});
              await logCrmEvent({ contactId: full.contactId, oppId: full.id, kind: "system", body: `🏆 DEAL WON — generated a closed deal on the Deals board.`, actor: "dispo-crm" });
            }
          }
        }
        if (/offer_call|verbal_offer/i.test(stage)) postToSpace("acquisitions", `💬 Offer in motion — ${(full.assignedTo || me.name).split(" ")[0]} ${stage.includes("verbal") ? "is negotiating a verbal offer" : "is making the offer call"} on ${addr || contact?.name || "a lead"}`).catch(() => {});
      } catch { /* chat bells never block */ }
      if (/sign/i.test(stage) && !/missed|dead/i.test(stage)) {
        // 💰 iSpeedToLead Closer Program (Jon 2026-10-08): they PAY us for
        // reporting closings on their leads — never let one slip.
        const src = `${contact?.name ?? ""} ${(await db.crmContact.findUnique({ where: { id: full.contactId }, select: { source: true, tags: true } }).then((x) => `${x?.source ?? ""} ${x?.tags ?? ""}`))}`;
        const oppTags = (await db.crmOpportunity.findUnique({ where: { id: full.id }, select: { tags: true, value: true, askPrice: true } }));
        if (/ispeed|dealspeed/i.test(`${src} ${oppTags?.tags ?? ""}`)) {
          const price = oppTags?.value ?? oppTags?.askPrice;
          await db.crmTask.create({ data: { oppId: full.id, contactId: full.contactId, title: `💰 GET PAID — report this closing to iSpeedToLead Closer Program: app.ispeedtolead.com/closer-program (${contact?.name ?? "seller"}${addr ? ` · ${addr}` : ""}${price != null ? ` · $${price.toLocaleString()}` : ""})`, due: today, assignedTo: "Jon Cruz", createdBy: "closer-program" } }).catch(() => {});
          await logCrmEvent({ contactId: full.contactId, oppId: full.id, kind: "system", body: `💰 iSpeedToLead lead SIGNED — submit to the Closer Program for the payout: https://app.ispeedtolead.com/closer-program`, actor: "closer-program" });
        }
      }
      // (comp-review stage retired 2026-10-08 — manager review happens inside
      // the merged Comp → Offer stage when Jon wants it, not as a board column)
    })().catch(() => {});
  }
  revalidatePath("/crm");
  revalidatePath(`/crm/${id}`);
}

// 📎 Upload a file into THIS deal's Drive folder (same folder the Documents list +
// uploadLeadDocAction use), so anything attached to a note also shows in Documents.
async function uploadToDealDrive(oppId: string, file: File): Promise<{ id: string; link: string } | null> {
  const { gdriveConfigured, ensureSubfolder, uploadToFolder, listFolder, dealsParent } = await import("@/lib/gdrive");
  if (!gdriveConfigured()) return null;
  const DEALS_PARENT = await dealsParent();
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { title: true, contact: { select: { address: true, name: true } } } });
  const label = (opp?.contact?.address || opp?.title || opp?.contact?.name || "Unfiled").trim();
  const streetNo = label.match(/^\d+/)?.[0];
  let folderId = "";
  if (streetNo) { const existing = (await listFolder(DEALS_PARENT).catch(() => [])).find((f) => f.name.startsWith(streetNo)); if (existing) folderId = existing.id; }
  if (!folderId) folderId = await ensureSubfolder(DEALS_PARENT, label.slice(0, 80));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const up = await uploadToFolder(folderId, file.name.slice(0, 120), bytes, file.type || "application/octet-stream");
  return { id: up.id, link: up.link };
}

export async function addCrmNoteAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  // Rich notes (Jon 2026-10-20): sanitize the HTML to our tag whitelist and allow a
  // bigger body. A plain-text note passes through unchanged (no tags → sanitize noop).
  const { sanitizeNoteHtml } = await import("@/lib/note-html");
  const body = sanitizeNoteHtml(String(formData.get("body") ?? "").trim()).slice(0, 8000);
  const hasText = !!body.replace(/<[^>]*>/g, "").trim();
  // 📎 optional document on the note (Jon 2026-10-21) — uploads to the deal's Drive
  // folder (so it ALSO appears in the lead's Documents) and links from the note.
  const file = formData.get("file");
  let meta: Record<string, unknown> | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) {
      await logCrmEvent({ contactId, oppId, kind: "system", body: "📎 Attachment skipped — over 15MB; compress it and retry.", actor: me.name });
    } else {
      try {
        const up = await uploadToDealDrive(oppId, file);
        if (up) meta = { link: up.link, driveId: up.id, name: file.name };
        else await logCrmEvent({ contactId, oppId, kind: "system", body: "📎 Attachment couldn't save — document storage isn't configured. Tell Jon.", actor: me.name });
      } catch (e) { await logCrmEvent({ contactId, oppId, kind: "system", body: `📎 Attachment failed: ${String(e).slice(0, 120)}`, actor: me.name }).catch(() => {}); }
    }
  }
  if (!contactId || (!hasText && !meta)) return;
  const noteBody = hasText ? body : `📎 ${String(meta?.name ?? "document")}`;
  await logCrmEvent({ contactId, oppId, kind: "note", body: noteBody, meta, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

// ✎ Edit a note you wrote (Jon 2026-10-13). Only the note's author may edit it
// (managers can fix any). Appends an "(edited)" marker so the timeline is honest.
export async function editCrmNoteAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const oppId = String(formData.get("oppId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!id || !body) return;
  const ev = await db.crmEvent.findUnique({ where: { id }, select: { actor: true, kind: true } });
  if (!ev || ev.kind !== "note") return;
  const { isManager } = await import("@/lib/auth");
  if (ev.actor !== me.name && !isManager(me)) return; // only your own note
  const marked = /\(edited\)\s*$/.test(body) ? body : `${body}  _(edited)_`;
  await db.crmEvent.update({ where: { id }, data: { body: marked } });
  revalidatePath(`/crm/${oppId}`);
  revalidatePath("/crm/conversations");
}

// 🗑 Delete a note you wrote (author or manager). Only kind:"note" — never a
// call/sms/email audit row. Jon 2026-10-13.
export async function deleteCrmNoteAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const oppId = String(formData.get("oppId") ?? "");
  if (!id) return;
  const ev = await db.crmEvent.findUnique({ where: { id }, select: { actor: true, kind: true } });
  if (!ev || ev.kind !== "note") return;
  const { isManager } = await import("@/lib/auth");
  if (ev.actor !== me.name && !isManager(me)) return;
  await db.crmEvent.delete({ where: { id } });
  revalidatePath(`/crm/${oppId}`);
  revalidatePath("/crm/conversations");
}

/** Log a call/sms/email the rep just did manually (Telnyx auto-log comes via webhook). */
export async function logCrmTouchAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const kind = String(formData.get("kind") ?? "call");
  const body = String(formData.get("body") ?? "").trim().slice(0, 500);
  if (!contactId || !["call", "sms", "email"].includes(kind)) return;
  await logCrmEvent({ contactId, oppId, kind, body: body || `${kind} — logged by ${me.name}`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

export async function saveOppMetaAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const num = (k: string) => { const s = String(formData.get(k) ?? "").replace(/[$,\s]/g, ""); return s === "" ? null : Number(s) || null; };
  const plRaw = formData.get("pipeline");
  const { formatAddress } = await import("@/lib/address");
  // Only write fields that are actually PRESENT in the form, so autosave (which may
  // submit a partial form) + a form that omits the owner field never wipe data
  // (Jon 2026-10-24). Owner is saved separately via setOppOwnerAction.
  const has = (k: string) => formData.get(k) != null;
  // 🔎 Lead source (acquisitions) lives in formData — no schema column (Jon 2026-10-26).
  let fdMerge: Record<string, unknown> | null = null;
  if (has("leadSource")) {
    const row = await db.crmOpportunity.findUnique({ where: { id }, select: { formData: true } });
    const existing = (row?.formData as Record<string, unknown> | null) ?? {};
    fdMerge = { ...existing, __leadSource: String(formData.get("leadSource")).trim().slice(0, 80) };
  }
  await db.crmOpportunity.update({ where: { id }, data: {
    ...(plRaw != null ? { pipeline: String(plRaw) === "War Room" ? "" : String(plRaw) } : {}),
    ...(has("title") ? { title: formatAddress(String(formData.get("title") ?? "")) || undefined } : {}),
    ...(has("assignedTo") ? { assignedTo: String(formData.get("assignedTo")).trim() } : {}),
    ...(has("tags") ? { tags: String(formData.get("tags")).trim().slice(0, 300) } : {}),
    ...(has("nextFollowUp") ? { nextFollowUp: String(formData.get("nextFollowUp")).trim() } : {}),
    ...(has("value") ? { value: num("value") } : {}),
    ...(has("askPrice") ? { askPrice: num("askPrice") } : {}),
    ...(fdMerge ? { formData: fdMerge as never } : {}),
  } });
  revalidatePath(`/crm/${id}`);
  revalidatePath("/crm");
}

export async function saveCrmContactAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const oppId = String(formData.get("oppId") ?? "");
  if (!id) return;
  // pinnedNote + tags are only written when their field is PRESENT, so removing
  // those inputs from the contact form never wipes existing data (Jon 2026-10-24).
  await db.crmContact.update({ where: { id }, data: {
    name: String(formData.get("name") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim(),
    altPhone: String(formData.get("altPhone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    altEmail: String(formData.get("altEmail") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    ...(formData.get("ctags") != null ? { tags: String(formData.get("ctags")).trim().slice(0, 300) } : {}),
    ...(formData.get("pinnedNote") != null ? { pinnedNote: String(formData.get("pinnedNote")).trim().slice(0, 300) } : {}),
  } });
  // 🧭 APN/parcel lives on the opportunity (no contact column) — Jon 2026-10-13
  const apn = formData.get("apn");
  if (apn != null && oppId) {
    const o = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true } });
    const fd = (o?.formData ?? {}) as Record<string, unknown>;
    const prop = (fd.property ?? {}) as Record<string, unknown>;
    await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, property: { ...prop, apn: String(apn).trim() } } } });
  }
  revalidatePath(`/crm/${oppId}`);
}

export async function addCrmTaskAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  if (!title) return;
  const created = await db.crmTask.create({ data: {
    oppId, contactId, title,
    due: String(formData.get("due") ?? "").trim(),
    assignedTo: String(formData.get("assignedTo") ?? "").trim() || me.name,
    createdBy: me.name,
  } });
  const note = String(formData.get("note") ?? "").trim();
  if (note) { const { writeTaskNote } = await import("@/lib/task-notes"); await writeTaskNote(created.id, note); }
  const dueTime = String(formData.get("dueTime") ?? "").trim(); // "HH:MM" — drives reminders
  if (dueTime) { const { setTaskTime } = await import("@/lib/task-times"); await setTaskTime(created.id, dueTime); }
  let prio = String(formData.get("priority") ?? "");
  if (!prio) {
    // 🤖 predicted priority — the rep can always flip the dot afterwards
    const hay = `${title} ${note}`.toLowerCase();
    if (/\burgent|asap|now\b|today|call.?back|closing|wire|contract|offer|escrow|deadline|overdue|🔴/.test(hay) || String(formData.get("due") ?? "") === new Date().toISOString().slice(0, 10)) prio = "urgent";
    else if (/\bsomeday|later|idea|maybe|research|read|explore|eventually|low\b/.test(hay)) prio = "low";
  }
  if (["urgent", "low"].includes(prio)) {
    const fd2 = new FormData(); fd2.set("id", created.id); fd2.set("p", prio);
    await setTaskPriorityAction(fd2);
  }
  const recur = String(formData.get("recur") ?? "");
  if (["daily", "weekdays", "weekly", "monthly"].includes(recur)) {
    const recRow = await db.resource.findFirst({ where: { category: "__task_recur__" } });
    let map: Record<string, string> = {};
    try { map = recRow?.description ? JSON.parse(recRow.description) : {}; } catch { /* fresh */ }
    map[created.id] = recur;
    const description = JSON.stringify(map);
    if (recRow) await db.resource.update({ where: { id: recRow.id }, data: { description } });
    else await db.resource.create({ data: { title: "task-recur", category: "__task_recur__", url: "", description } });
  }
  revalidatePath(`/crm/${oppId}`);
  revalidatePath("/crm");
  revalidatePath("/crm/tasks");
}

export async function toggleCrmTaskAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const t = await db.crmTask.findUnique({ where: { id } });
  if (!t) return;
  await db.crmTask.update({ where: { id }, data: t.doneAt ? { doneAt: null, doneBy: "" } : { doneAt: new Date(), doneBy: me.name } });
  if (!t.doneAt && t.contactId) await logCrmEvent({ contactId: t.contactId, oppId: t.oppId, kind: "task", body: `Done: ${t.title}`, actor: me.name });
  if (!t.doneAt) {
    // 🔁 recurring: completing one spawns the next occurrence (rule in __task_recur__)
    try {
      const recRow = await db.resource.findFirst({ where: { category: "__task_recur__" } });
      const recur: Record<string, string> = recRow?.description ? JSON.parse(recRow.description) : {};
      const rule = recur[id];
      if (rule) {
        const base = t.due ? new Date(t.due + "T12:00:00Z") : new Date();
        const next = new Date(base);
        if (rule === "daily") next.setUTCDate(next.getUTCDate() + 1);
        else if (rule === "weekdays") { do { next.setUTCDate(next.getUTCDate() + 1); } while ([0, 6].includes(next.getUTCDay())); }
        else if (rule === "weekly") next.setUTCDate(next.getUTCDate() + 7);
        else if (rule === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
        const spawned = await db.crmTask.create({ data: { oppId: t.oppId, contactId: t.contactId, title: t.title, due: next.toISOString().slice(0, 10), assignedTo: t.assignedTo, createdBy: t.createdBy || "recurring" } });
        recur[spawned.id] = rule; delete recur[id];
        await db.resource.update({ where: { id: recRow!.id }, data: { description: JSON.stringify(recur) } });
        const { readTaskNotes, writeTaskNote } = await import("@/lib/task-notes");
        const n = (await readTaskNotes())[id]; if (n) await writeTaskNote(spawned.id, n);
      }
    } catch { /* recurrence best-effort */ }
    // 🔎 system tasks Jon completes go to Claude's verification queue (Jon 2026-10-08)
    try {
      if (["warroom-updates", "flag-watch", "perf-watchdog"].includes(t.createdBy)) {
        const qRow = await db.resource.findFirst({ where: { category: "__task_verify_queue__" } });
        let q: Array<{ id: string; title: string; at: string }> = [];
        try { q = qRow?.description ? JSON.parse(qRow.description) : []; } catch { /* fresh */ }
        q.unshift({ id, title: t.title, at: new Date().toISOString() });
        const description = JSON.stringify(q.slice(0, 50));
        if (qRow) await db.resource.update({ where: { id: qRow.id }, data: { description } });
        else await db.resource.create({ data: { title: "task-verify-queue", category: "__task_verify_queue__", url: "", description } });
      }
    } catch { /* queue best-effort */ }
  }
  revalidatePath(`/crm/${t.oppId}`);
  revalidatePath("/crm");
  revalidatePath("/crm/tasks");
}

export async function addCrmApptAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const when = String(formData.get("at") ?? ""); // datetime-local
  const at = when ? new Date(when) : null;
  if (!title || !at || Number.isNaN(at.getTime())) return;
  // phone vs in-person + what the appointment is FOR (Jon 2026-10-07)
  const aptType = String(formData.get("aptType") ?? "") === "inperson" ? "🤝 In person" : "📞 Phone";
  const purposeRaw = String(formData.get("purpose") ?? "").trim();
  const purpose = purposeRaw === "custom" ? String(formData.get("purposeCustom") ?? "").trim().slice(0, 60) : purposeRaw;
  const prefix = [aptType, purpose].filter(Boolean).join(" · ");
  const noteIn = String(formData.get("note") ?? "").trim();
  const appt = await db.crmAppointment.create({ data: { oppId, contactId, title, at, withWho: String(formData.get("withWho") ?? "").trim() || me.name, note: `${prefix ? `[${prefix}] ` : ""}${noteIn}`.slice(0, 300), createdBy: me.name } });
  // mirror onto the rep's personal Google Calendar (never blocks booking)
  (async () => {
    const { pushApptToGcal } = await import("@/lib/gcal");
    const c = contactId ? await db.crmContact.findUnique({ where: { id: contactId }, select: { name: true } }) : null;
    const r = await pushApptToGcal({ id: appt.id, title: appt.title, at: appt.at, note: appt.note, withWho: appt.withWho, leadName: c?.name, oppId });
    if (!r.ok && contactId) await logCrmEvent({ contactId, oppId, kind: "system", body: `📅 Google Calendar sync skipped: ${r.why} (share your calendar with the service account — see /crm/calendar)`, actor: "gcal" }).catch(() => {});
  })().catch(() => {});
  if (contactId) await logCrmEvent({ contactId, oppId, kind: "appt", body: `Appointment set: ${title} — ${at.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
  revalidatePath("/crm");
  revalidatePath("/crm/calendar");
}

export async function deleteCrmApptAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const a = await db.crmAppointment.findUnique({ where: { id } });
  if (!a) return;
  await db.crmAppointment.delete({ where: { id } }).catch(() => {});
  (async () => { const { removeApptFromGcal } = await import("@/lib/gcal"); await removeApptFromGcal(id); })().catch(() => {});
  revalidatePath(`/crm/${a.oppId}`);
  revalidatePath("/crm/calendar");
}

/** Owner/managers: set who gets the paid channels (call / SMS / email). */
export async function saveCommsPermsAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const { readCommsMap, writeCommsMap } = await import("@/lib/crm-comms");
  const map = await readCommsMap();
  const first = String(formData.get("first") ?? "").toLowerCase().trim();
  if (!first) return;
  map[first] = { call: formData.get("call") === "on", sms: formData.get("sms") === "on", email: formData.get("email") === "on" };
  await writeCommsMap(map);
  revalidatePath("/crm");
}

/** Owner: confine a rep to ONE pipeline (they see only that pipeline + its leads). */
export async function saveCrmPipelineLockAction(formData: FormData) {
  const me = await getCurrentUser();
  const { canAccessCSuite } = await import("@/lib/auth");
  if (!me || !canAccessCSuite(me)) return;
  const { readPipelineLocks, writePipelineLocks } = await import("@/lib/crm");
  const map = await readPipelineLocks();
  const first = String(formData.get("first") ?? "").toLowerCase().trim();
  if (!first) return;
  // Multi-select: every ticked pipeline arrives as a "pipeline" entry.
  const picked = [...new Set(formData.getAll("pipeline").map((v) => String(v).trim()).filter(Boolean))];
  if (picked.length) map[first] = picked; else delete map[first];
  await writePipelineLocks(map);
  revalidatePath("/crm");
  revalidatePath("/crm/access");
}

/** Anyone: save their own email signature (used on every CRM email they send). */
export async function saveSignatureAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const { readSignatures, writeSignatures, firstOf } = await import("@/lib/crm-comms");
  const map = await readSignatures();
  map[firstOf(me.name)] = String(formData.get("signature") ?? "").trim().slice(0, 600);
  await writeSignatures(map);
  revalidatePath("/account");
}

/** 🖼 Anyone: upload (or remove) their email-signature IMAGE — the branded block
 *  from their Gmail. Embedded at the bottom of every email they send. */
export async function saveSignatureImageAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const { firstOf } = await import("@/lib/crm-comms");
  const key = firstOf(me.name);
  if (formData.get("remove")) {
    const { deleteSignatureImage } = await import("@/lib/crm-comms");
    await deleteSignatureImage(key);
    revalidatePath("/account");
    return;
  }
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return;
  if (!file.type.startsWith("image/") || file.size > 800 * 1024) { // keep emails light
    redirect("/account?sig=bad");
  }
  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const { writeSignatureImage } = await import("@/lib/crm-comms");
  await writeSignatureImage(key, b64, file.type);
  revalidatePath("/account");
  redirect("/account?sig=ok");
}

/** ✉️ Send a real email to the seller from the card (Resend, reply-to us). */
export async function sendCrmEmailAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const { commsFor } = await import("@/lib/crm-comms");
  if (!(await commsFor(me)).email) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const to = String(formData.get("to") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 150);
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!to || !subject || !body) return;
  if (contactId && await isDnd(contactId, "email")) {
    await logCrmEvent({ contactId, oppId, kind: "email", body: `🔕 EMAIL NOT SENT — this contact is DND for email.`, actor: me.name });
    revalidatePath(`/crm/${oppId}`);
    return;
  }
  // GHL-style agent identity: From = the rep (on our domain), reply-to their
  // real inbox, their own signature appended.
  const { readSignatures, firstOf, defaultSignature, hasSignatureImage } = await import("@/lib/crm-comms");
  const sig = (await readSignatures())[firstOf(me.name)] || defaultSignature(me.name);
  const domain = (process.env.ALERT_EMAIL_FROM ?? "info@freedom-offers.com").split("@")[1] ?? "freedom-offers.com";
  // Build a VALID from: clean local-part (names like "Jon/Jonathan" produced an
  // illegal address → Resend 422 "Invalid from field") + a display name with no
  // angle brackets/quotes to break the "Name <email>" format (Jon 2026-10-21).
  const localPart = (firstOf(me.name).match(/[a-z0-9]+([._-][a-z0-9]+)*/i)?.[0] || "team").toLowerCase();
  const displayName = me.name.replace(/[<>"\\]/g, "").trim() || "Freedom Offers";
  const fromAddr = `${displayName} <${localPart}@${domain}>`;
  // 🖼 branded signature image (their Gmail block), referenced by URL so it renders in email clients
  const sigImg = (await hasSignatureImage(firstOf(me.name)))
    ? `<div style="margin-top:10px"><img src="https://kpi-tracker-lovat.vercel.app/api/sig/${encodeURIComponent(firstOf(me.name))}" alt="${me.name.replace(/"/g, "")}" style="max-width:380px;height:auto;display:block"></div>`
    : "";
  const html = `<p>${body.replace(/\n/g, "<br>")}</p><p style="color:#64748b;font-size:13px;white-space:pre-line">${sig.replace(/</g, "&lt;")}</p>${sigImg}`;
  const { getChannelConfig, sendEmailTo, sendEmailWithAttachment } = await import("@/lib/notify");
  const cfg = { ...(await getChannelConfig()), emailFrom: fromAddr };
  const errOut: { msg?: string } = {};
  // 📎 optional attachment (Jon's worklist 2026-10-12) — ≤10MB via Resend
  const file = formData.get("file");
  let ok: boolean;
  let attachNote = "";
  if (file instanceof File && file.size > 0 && file.size <= 10 * 1024 * 1024) {
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    ok = await sendEmailWithAttachment([to], subject, html, { filename: file.name.slice(0, 100), content: b64 }, cfg);
    attachNote = ` 📎 ${file.name.slice(0, 60)}`;
  } else {
    ok = await sendEmailTo([to], subject, html, cfg, me.email || process.env.CASCADE_REPLY_TO || "info@freedom-offers.com", errOut);
  }
  await logCrmEvent({ contactId, oppId, kind: "email", body: `➡️ Us: ${subject}${attachNote} — ${body.slice(0, 300)}${ok ? "" : ` (SEND FAILED${errOut.msg ? `: ${errOut.msg}` : ""})`}`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** 💬 Send a real SMS via Telnyx from the card. */
export async function sendCrmSmsAction(formData: FormData): Promise<void> {
  // quiet=1 → no route refresh (the bell phone manages its own UI and a refresh was closing it — Jon 2026-10-09)
  const skipRefresh = String(formData.get("quiet") ?? "") === "1";
  const me = await crmUser();
  if (!me) return;
  const { commsFor } = await import("@/lib/crm-comms");
  if (!(await commsFor(me)).sms) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const to = String(formData.get("to") ?? "").replace(/[^+\d]/g, "");
  const text = String(formData.get("text") ?? "").trim().slice(0, 900);
  const hasPhoto = (() => { const f = formData.get("photo"); return f instanceof File && f.size > 0; })();
  let from = process.env.TELNYX_SMS_FROM || process.env.TELNYX_CALLER_ID;
  // rep picked a From number — honor it only if it's one of OUR lines
  const reqFrom = String(formData.get("from") ?? "").replace(/[^+\d]/g, "");
  // 📌 sticky line (Jon 2026-10-09): no explicit pick → default to the line
  // this lead ALREADY knows (last line they texted or we texted them on), so
  // they never get a confusing text from a second number.
  if (!reqFrom && contactId) {
    try {
      const prev = await db.crmEvent.findMany({ where: { contactId, kind: "sms" }, orderBy: { at: "desc" }, take: 20, select: { meta: true } });
      for (const e of prev) {
        const m = e.meta as { line?: string } | null;
        if (m?.line) { from = m.line; break; }
      }
    } catch { /* env default */ }
  }
  if (reqFrom && reqFrom !== from && process.env.TELNYX_API_KEY) {
    try {
      const cfgRow = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
      const cfg = (cfgRow?.description ? JSON.parse(cfgRow.description) : {}) as { connId?: string; ccAppId?: string };
      const ours = new Set([cfg.connId, cfg.ccAppId].filter(Boolean));
      const res = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=250", { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, cache: "no-store" });
      const body = (await res.json()) as { data?: Array<{ phone_number?: string; connection_id?: string }> };
      if ((body.data ?? []).some((n) => n.phone_number === reqFrom && ours.has(String(n.connection_id ?? "")))) from = reqFrom;
    } catch { /* fall back to the default line */ }
  }
  // 📞 never text from a number that isn't live on Telnyx right now — a mid-port
  // number (still on GHL) rejects/drops the send. Keep the chosen line if it's live
  // and SMS-capable, else swap to a live texting line (Jon 2026-10-21).
  if (process.env.TELNYX_API_KEY) {
    try {
      const { partitionNumbers, pickWorkingCallerId, digits } = await import("@/lib/telnyx-numbers");
      const { live } = await partitionNumbers();
      const smsLive = live.filter((n) => n.msgProfile);
      const fromD = digits(from ?? "");
      const isLiveSms = !!fromD && smsLive.some((n) => digits(n.number) === fromD);
      if (!isLiveSms) { const pick = smsLive[0]?.number || (await pickWorkingCallerId(from)).callerId; if (pick) from = pick; }
    } catch { /* keep the configured from */ }
  }
  if (!to || (!text && !hasPhoto)) return; // photo-only MMS is a valid send
  // 🕘 quiet hours apply to TEXTS too (Jon 2026-10-08): 9pm–8am in the lead's
  // own time zone (by area code) = blocked, logged so the rep sees why.
  {
    const { quietHoursWarning } = await import("@/lib/npa-tz");
    const quiet = quietHoursWarning(to);
    if (quiet) {
      await logCrmEvent({ contactId, oppId, kind: "sms", body: `🕘 SMS NOT SENT — ${quiet} Draft was: ${text.slice(0, 160)}`, actor: me.name });
      if (!skipRefresh) revalidatePath(`/crm/${oppId}`);
      return;
    }
  }
  if (contactId && await isDnd(contactId, "sms")) {
    await logCrmEvent({ contactId, oppId, kind: "sms", body: `🔕 SMS NOT SENT — this contact is DND for texts.`, actor: me.name });
    if (!skipRefresh) revalidatePath(`/crm/${oppId}`);
    return;
  }
  if (!process.env.TELNYX_API_KEY || !from) {
    await logCrmEvent({ contactId, oppId, kind: "sms", body: `SMS NOT SENT — set TELNYX_SMS_FROM (a Telnyx number on a messaging profile) in Vercel. Message was: ${text.slice(0, 200)}`, actor: me.name });
    if (!skipRefresh) revalidatePath(`/crm/${oppId}`);
    return;
  }
  // 📷 MMS (Jon's worklist 2026-10-12): the composer attaches a pre-compressed
  // photo; it lands in Drive (public direct link) so Telnyx can fetch it.
  let mediaUrl = "";
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0 && photo.size <= 2 * 1024 * 1024) {
    try {
      const { gdriveConfigured, uploadToDrive } = await import("@/lib/gdrive");
      if (gdriveConfigured()) mediaUrl = await uploadToDrive(`mms-${Date.now()}.jpg`, new Uint8Array(await photo.arrayBuffer()), photo.type || "image/jpeg");
    } catch { /* fall back to text-only */ }
  }
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, text: text || (mediaUrl ? "📷" : text), ...(mediaUrl ? { media_urls: [mediaUrl] } : {}) }),
  });
  const ok = res.ok;
  const err = ok ? "" : (await res.text()).slice(0, 140);
  await logCrmEvent({ contactId, oppId, kind: "sms", body: `➡️ Us: ${mediaUrl ? `📷 photo${text ? " — " : ""}` : ""}${text}${ok ? "" : ` (SEND FAILED: ${err})`}`, meta: { dir: "outbound", line: from ?? "", ...(mediaUrl ? { media: [mediaUrl] } : {}) }, actor: me.name });
  if (!skipRefresh) revalidatePath(`/crm/${oppId}`);
}

// ── Task priority (Jon 2026-10-08: urgent/pending colors) — Resource map
// __task_priority__ {taskId: "urgent"|"low"}; absent = normal (yellow/pending).
export async function readTaskPriorities(): Promise<Record<string, string>> {
  const row = await db.resource.findFirst({ where: { category: "__task_priority__" } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : {}; } catch { return {}; }
}
export async function setTaskPriorityAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const p = String(formData.get("p") ?? "");
  if (!id || !["urgent", "normal", "low"].includes(p)) return;
  const row = await db.resource.findFirst({ where: { category: "__task_priority__" } });
  let map: Record<string, string> = {};
  try { map = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
  if (p === "normal") delete map[id]; else map[id] = p;
  const keys = Object.keys(map); if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete map[k];
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "task-priority", category: "__task_priority__", url: "", description } });
  revalidatePath("/crm/tasks");
}

/** 🔕 DND by channel (GHL-style, Jon 2026-10-08): toggles dnd_all / dnd_sms /
 *  dnd_email / dnd_call tags on the contact — every sender checks them. */
export async function toggleDndAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const contactId = String(formData.get("contactId") ?? "");
  const ch = String(formData.get("channel") ?? "");
  if (!contactId || !["all", "sms", "email", "call"].includes(ch)) return;
  const tag = `dnd_${ch}`;
  const c = await db.crmContact.findUnique({ where: { id: contactId }, select: { tags: true } });
  if (!c) return;
  const tags = c.tags.split(",").map((t) => t.trim()).filter(Boolean);
  const on = tags.includes(tag);
  const next = on ? tags.filter((t) => t !== tag) : [...tags, tag];
  await db.crmContact.update({ where: { id: contactId }, data: { tags: next.join(",") } });
  await logCrmEvent({ contactId, oppId: "", kind: "system", body: `${on ? "🔔 DND removed" : "🔕 DND set"} — ${ch === "all" ? "ALL channels" : ch} by ${me.name}`, actor: me.name }).catch(() => {});
  revalidatePath("/crm");
}

/** DND check used by every outbound sender. */
export async function isDnd(contactId: string, channel: "sms" | "email" | "call"): Promise<boolean> {
  const c = await db.crmContact.findUnique({ where: { id: contactId }, select: { tags: true } });
  if (!c) return false;
  return /\bdnc\b|\bdnd_all\b/i.test(c.tags) || new RegExp(`\\bdnd_${channel}\\b`, "i").test(c.tags);
}

/** 🗑 Delete a task — archive-style: marked done with a deleted stamp so the
 *  Completed tab keeps the paper trail (Jon 2026-10-09). */
export async function deleteTaskAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const t = await db.crmTask.findUnique({ where: { id }, select: { assignedTo: true, doneAt: true } });
  if (!t) return;
  if (!isManager(me) && t.assignedTo.toLowerCase() !== me.name.toLowerCase()) return;
  await db.crmTask.update({ where: { id }, data: { doneAt: t.doneAt ?? new Date(), doneBy: `🗑 deleted by ${me.name}` } });
  revalidatePath("/crm/tasks");
  revalidatePath("/crm");
}

/** 👤 Reassign a task to someone else (managers, or the current assignee). */
export async function reassignTaskAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const who = String(formData.get("assignedTo") ?? "").trim();
  if (!id || !who) return;
  const t = await db.crmTask.findUnique({ where: { id }, select: { assignedTo: true } });
  if (!t) return;
  if (!isManager(me) && t.assignedTo.toLowerCase() !== me.name.toLowerCase()) return;
  await db.crmTask.update({ where: { id }, data: { assignedTo: who } });
  revalidatePath("/crm/tasks");
}

/** 📝 Save/edit a task's description (GHL-style details). */
export async function saveTaskNoteAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { writeTaskNote } = await import("@/lib/task-notes");
  await writeTaskNote(id, String(formData.get("note") ?? ""));
  revalidatePath("/crm/tasks");
}

/** 🔗 Connect a floating task to a contact (+ their live opportunity) by name. */
export async function linkTaskAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const q = String(formData.get("q") ?? "").trim();
  if (!id || q.length < 2) return;
  const contact = await db.crmContact.findFirst({ where: { archivedAt: null, name: { contains: q, mode: "insensitive" } }, select: { id: true } });
  if (!contact) return;
  const opp = await db.crmOpportunity.findFirst({ where: { contactId: contact.id, archivedAt: null }, select: { id: true } });
  await db.crmTask.update({ where: { id }, data: { contactId: contact.id, oppId: opp?.id ?? "" } });
  revalidatePath("/crm/tasks");
}

/** 👁 Bulk conversation actions: mark read / unread / DNC (Jon 2026-10-08). */
export async function bulkConvAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const ids = formData.getAll("cids").map(String).filter(Boolean).slice(0, 200);
  const op = String(formData.get("op") ?? "");
  if (!ids.length) return;
  const { setConvRead } = await import("@/lib/conv-read");
  if (op === "read") await setConvRead(ids, true);
  else if (op === "unread") await setConvRead(ids, false);
  else if (op === "dnc" && isManager(me)) {
    const { dncContact } = await import("@/lib/crm-dnc");
    for (const id of ids) await dncContact(id, `marked DNC by ${me.name}`);
    await setConvRead(ids, true);
  }
  revalidatePath("/crm/conversations");
  revalidatePath("/crm");
}

/** 📎 Upload a document for this lead — stored in the deal's Google Drive
 *  folder (our SOP: files live in Drive, never Vercel/Supabase), linked on
 *  the lead's Documents panel + timeline. */
export async function uploadLeadDocAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const docType = String(formData.get("docType") ?? "").trim(); // Purchase Agreement, Assignment, …
  const file = formData.get("file");
  if (!oppId || !contactId || !(file instanceof File) || file.size === 0) return;
  if (file.size > 15 * 1024 * 1024) {
    await logCrmEvent({ contactId, oppId, kind: "system", body: "📎 Upload skipped — file over 15MB; compress it and retry.", actor: me.name });
    revalidatePath(`/crm/${oppId}`);
    return;
  }
  // Auto-title: the chosen doc type, else the file's own name (team can change it).
  const title = docType || file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || file.name;
  try {
    const { gdriveConfigured, ensureSubfolder, uploadToFolder, listFolder, dealsParent } = await import("@/lib/gdrive");
    if (!gdriveConfigured()) {
      await logCrmEvent({ contactId, oppId, kind: "system", body: "📎 Upload couldn't save — document storage isn't configured. Tell Jon.", actor: me.name });
      revalidatePath(`/crm/${oppId}`); return;
    }
    const DEALS_PARENT = await dealsParent();
    const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { title: true, contact: { select: { address: true, name: true } } } });
    const label = (opp?.contact.address || opp?.title || opp?.contact.name || "Unfiled").trim();
    const streetNo = label.match(/^\d+/)?.[0];
    let folderId = "";
    if (streetNo) {
      const existing = (await listFolder(DEALS_PARENT).catch(() => [])).find((f) => f.name.startsWith(streetNo));
      if (existing) folderId = existing.id;
    }
    if (!folderId) folderId = await ensureSubfolder(DEALS_PARENT, label.slice(0, 80));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const driveName = `${docType ? docType + " - " : ""}${file.name}`.slice(0, 120);
    const up = await uploadToFolder(folderId, driveName, bytes, file.type || "application/octet-stream");
    await logCrmEvent({ contactId, oppId, kind: "file", body: `📎 ${title} — uploaded to the deal's Drive folder`, meta: { driveId: up.id, link: up.link, docType }, actor: me.name });
  } catch (e) {
    await logCrmEvent({ contactId, oppId, kind: "system", body: `📎 Upload failed: ${String(e).slice(0, 120)}`, actor: me.name }).catch(() => {});
  }
  revalidatePath(`/crm/${oppId}`);
}

/** 🗑 Delete an uploaded document (Jon 2026-10-26: Marie uploaded the same PDF 11+
 *  times — the team needs to clear duplicates). Trashes the file in Google Drive
 *  (recoverable from Drive trash for 30 days) and removes the clutter from the lead:
 *  for an uploaded-file EVENT we delete the event row; for a file found directly in
 *  the Drive folder we just trash it. Manager or anyone on the deal. */
export async function deleteLeadDocAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  let driveId = String(formData.get("driveId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 90);
  if (!oppId) return;
  const { driveFileId, trashDriveFile } = await import("@/lib/gdrive");
  try {
    if (eventId) {
      const ev = await db.crmEvent.findUnique({ where: { id: eventId }, select: { meta: true, kind: true } });
      if (!ev || ev.kind !== "file") return;
      const meta = (ev.meta as { driveId?: string; link?: string } | null) ?? {};
      if (!driveId) driveId = meta.driveId || driveFileId(meta.link);
      if (driveId) await trashDriveFile(driveId).catch(() => {});
      await db.crmEvent.delete({ where: { id: eventId } }).catch(() => {});
    } else if (driveId) {
      await trashDriveFile(driveId).catch(() => {});
    } else return;
    await logCrmEvent({ contactId, oppId, kind: "system", body: `🗑 ${me.name.split(" ")[0]} removed a document${name ? ` (${name})` : ""} — moved to Google Drive trash.`, actor: me.name });
  } catch { /* best-effort */ }
  revalidatePath(`/crm/${oppId}`);
}

/** 🗑 "Delete" a lead = archive it (archive-never-delete rule): the opp is
 *  archived and, when nothing else references the contact, the contact too.
 *  Recoverable from the archived list. Manager or the lead's owner. */
/** 🔁 Merge duplicate contacts (accepted AI Update 2026-10-15; built by crm-enhancer
 *  2026-10-20). One ⭐ Keep click on /crm/contacts?dupes=1: every opportunity, text,
 *  call, note, task and appointment of the other cards moves onto the kept card,
 *  blanks on the kept card are filled from the others, and the others are ARCHIVED
 *  (never deleted) with a timeline receipt + an entry in __crm_merge_log__. */
export async function mergeContactsAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const { canManageAllLeads } = await import("@/lib/auth");
  if (!canManageAllLeads(me)) return;
  const keep = String(formData.get("keep") ?? "");
  const ids = [...new Set(formData.getAll("ids").map(String))].filter((x) => x && x !== keep);
  if (!keep || !ids.length) return;
  const K = await db.crmContact.findUnique({ where: { id: keep } });
  if (!K || K.archivedAt) return;
  const others = await db.crmContact.findMany({ where: { id: { in: ids }, archivedAt: null } });
  if (!others.length) return;
  const last10 = (p: string) => (p || "").replace(/\D/g, "").slice(-10);
  const patch: Record<string, string> = {};
  const tagSet = new Set(K.tags.split(",").map((t) => t.trim()).filter(Boolean));
  const merged: Array<{ id: string; name: string; phone: string; email: string; ghlId: string; assignedTo: string }> = [];
  for (const D of others) {
    await db.crmOpportunity.updateMany({ where: { contactId: D.id }, data: { contactId: K.id } });
    await db.crmEvent.updateMany({ where: { contactId: D.id }, data: { contactId: K.id } });
    await db.crmTask.updateMany({ where: { contactId: D.id }, data: { contactId: K.id } });
    await db.crmAppointment.updateMany({ where: { contactId: D.id }, data: { contactId: K.id } });
    // fill the kept card's blanks — never overwrite what it already has
    if (!K.email && !patch.email && D.email) patch.email = D.email;
    else if (D.email && D.email !== (patch.email || K.email) && !K.altEmail && !patch.altEmail) patch.altEmail = D.email;
    if (D.phone && last10(D.phone) !== last10(K.phone) && !K.altPhone && !patch.altPhone) patch.altPhone = D.phone;
    if (!K.address && !patch.address && D.address) patch.address = D.address;
    if (!K.source && !patch.source && D.source) patch.source = D.source;
    if (!K.pinnedNote && !patch.pinnedNote && D.pinnedNote) patch.pinnedNote = D.pinnedNote;
    if (!K.assignedTo && !patch.assignedTo && D.assignedTo) patch.assignedTo = D.assignedTo;
    for (const t of D.tags.split(",").map((x) => x.trim()).filter(Boolean)) tagSet.add(t);
    // GHL id rides along so a re-import lands on the kept card, not a resurrected dupe
    if (!K.ghlId && !patch.ghlId && D.ghlId) { patch.ghlId = D.ghlId; await db.crmContact.update({ where: { id: D.id }, data: { ghlId: "" } }).catch(() => {}); }
    await db.crmContact.update({ where: { id: D.id }, data: { archivedAt: new Date() } });
    merged.push({ id: D.id, name: D.name, phone: D.phone, email: D.email, ghlId: D.ghlId, assignedTo: D.assignedTo });
  }
  const tags = [...tagSet].join(", ");
  await db.crmContact.update({ where: { id: K.id }, data: { ...patch, ...(tags !== K.tags ? { tags } : {}) } });
  for (const D of merged) {
    await logCrmEvent({ contactId: K.id, kind: "system", actor: me.name, body: `🔁 Merged duplicate "${D.name}" (${D.phone || D.email || "no phone"}) into this contact — their leads, texts, calls, notes and tasks now live here; the other card is archived (recoverable). By ${me.name}.` });
  }
  try {
    const row = await db.resource.findFirst({ where: { category: "__crm_merge_log__" } });
    const prev: unknown[] = row?.description ? JSON.parse(row.description) : [];
    const description = JSON.stringify([{ at: new Date().toISOString(), by: me.name, keep: K.id, keepName: K.name, patch, merged }, ...prev].slice(0, 100));
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "crm-merge-log", category: "__crm_merge_log__", url: "", description } });
  } catch { /* log is best-effort */ }
  revalidatePath("/crm/contacts"); revalidatePath("/crm"); revalidatePath("/crm/conversations");
  redirect("/crm/contacts?dupes=1");
}

export async function archiveOppAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const opp = await db.crmOpportunity.findUnique({ where: { id }, select: { id: true, contactId: true, assignedTo: true } });
  if (!opp) return;
  if (!isManager(me) && opp.assignedTo && opp.assignedTo !== me.name) return;
  await db.crmOpportunity.update({ where: { id }, data: { archivedAt: new Date() } });
  const siblings = await db.crmOpportunity.count({ where: { contactId: opp.contactId, archivedAt: null } });
  if (siblings === 0) await db.crmContact.update({ where: { id: opp.contactId }, data: { archivedAt: new Date() } }).catch(() => {});
  await logCrmEvent({ contactId: opp.contactId, oppId: id, kind: "system", body: `🗑 Lead deleted (archived — recoverable) by ${me.name}`, actor: me.name }).catch(() => {});
  revalidatePath("/crm");
}

/** 💬 Save the editable auto-message templates (C-suite, from /crm/automations). */
export async function saveMsgTemplatesAction(formData: FormData) {
  const me = await getCurrentUser();
  const { canAccessCSuite } = await import("@/lib/auth");
  if (!canAccessCSuite(me)) return;
  const { saveMsgTemplates, MSG_TEMPLATE_META } = await import("@/lib/msg-templates");
  const patch: Record<string, string> = {};
  for (const m of MSG_TEMPLATE_META) {
    const v = formData.get(`t_${m.key}`);
    if (typeof v === "string") patch[m.key] = v.trim().slice(0, 2000);
  }
  await saveMsgTemplates(patch);
  revalidatePath("/crm/automations");
}

/** 📲 Start a conversation with ANY number/email (Jon 2026-10-08: "text myself
 *  without them being in contacts") — finds or creates the contact, then opens
 *  their thread in Conversations. */
export async function startConversationAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const phone = String(formData.get("phone") ?? "").replace(/[^+\d]/g, "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || phone || email;
  if (!phone && !email) return;
  const last10 = phone.replace(/\D/g, "").slice(-10);
  let contact = await db.crmContact.findFirst({
    where: { OR: [...(last10.length === 10 ? [{ phone: { contains: last10 } }] : []), ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])] },
  });
  if (!contact) {
    contact = await db.crmContact.create({ data: { name, phone: phone ? (phone.startsWith("+") ? phone : `+1${last10}`) : "", email, source: "Manual (new conversation)", assignedTo: me.name } });
    await logCrmEvent({ contactId: contact.id, oppId: "", kind: "system", body: `Contact created from New Message by ${me.name}`, actor: me.name }).catch(() => {});
  }
  redirect(`/crm/conversations?c=${contact.id}`);
}

/** List-view bulk actions: reassign / add tag / move stage for many at once. */
export async function bulkOppAction(formData: FormData) {
  const me = await getCurrentUser();
  const { canManageAllLeads } = await import("@/lib/auth");
  if (!canManageAllLeads(me)) return;
  const ids = formData.getAll("ids").map(String).filter(Boolean).slice(0, 500);
  const op = String(formData.get("op") ?? "");
  const val = String(formData.get("val") ?? "").trim();
  // delete needs no value; everything else does
  if (!ids.length || (op !== "delete" && !val)) return;
  if (op === "assign") {
    await db.crmOpportunity.updateMany({ where: { id: { in: ids } }, data: { assignedTo: val } });
  } else if (op === "stage" && ((await readPipelines()).some((p) => p.stages.some((st) => st.key === val)) || CRM_STAGES.some((s) => s.key === val))) {
    await db.crmOpportunity.updateMany({ where: { id: { in: ids } }, data: { stage: val, ...(val === "dead" ? { archivedAt: new Date() } : {}) } });
  } else if (op === "pipeline") {
    // move many to another pipeline → chosen stage (or first stage) + its owner
    const target = (await readPipelines()).find((p) => p.name === val);
    if (!target) return;
    const wantStage = String(formData.get("targetStage") ?? "").trim();
    const stage = target.stages.some((s) => s.key === wantStage) ? wantStage : (target.stages[0]?.key ?? "new");
    const own = ownerForPipeline(val);
    await db.crmOpportunity.updateMany({ where: { id: { in: ids } }, data: { pipeline: val, stage, archivedAt: null, ...(own ? { assignedTo: own } : {}) } });
  } else if (op === "tag") {
    for (const id of ids) {
      const o = await db.crmOpportunity.findUnique({ where: { id }, select: { tags: true } });
      if (o && !o.tags.toLowerCase().includes(val.toLowerCase())) await db.crmOpportunity.update({ where: { id }, data: { tags: o.tags ? `${o.tags}, ${val}` : val } });
    }
  } else if (op === "untag") {
    for (const id of ids) {
      const o = await db.crmOpportunity.findUnique({ where: { id }, select: { tags: true } });
      if (o) { const kept = o.tags.split(",").map((t) => t.trim()).filter((t) => t && t.toLowerCase() !== val.toLowerCase()).join(", "); if (kept !== o.tags) await db.crmOpportunity.update({ where: { id }, data: { tags: kept } }); }
    }
  } else if (op === "follower") {
    for (const id of ids) {
      const o = await db.crmOpportunity.findUnique({ where: { id }, select: { formData: true } });
      if (!o) continue;
      const fd = (o.formData ?? {}) as Record<string, unknown>;
      const cur = Array.isArray(fd.__followers) ? (fd.__followers as string[]) : [];
      await db.crmOpportunity.update({ where: { id }, data: { formData: { ...fd, __followers: [...new Set([...cur, val])] } as never } });
    }
  } else if (op === "delete") {
    await db.crmOpportunity.updateMany({ where: { id: { in: ids } }, data: { archivedAt: new Date() } });
  } else return;
  revalidatePath("/crm");
}

// 🗂 Apply a bulk op to EVERY lead in one pipeline stage (Jon 2026-10-13: "select
// all leads in a stage"), not just the ~60 loaded on the board. Same ops as
// bulkOppAction but scoped by pipeline+stage (+ optional owner), capped at 3000.
export async function bulkOppStageAction(formData: FormData) {
  const me = await getCurrentUser();
  const { canManageAllLeads } = await import("@/lib/auth");
  if (!canManageAllLeads(me)) return;
  const pipeline = String(formData.get("pipeline") ?? "");
  const stage = String(formData.get("stage") ?? "");
  const who = String(formData.get("who") ?? "").trim();
  const op = String(formData.get("op") ?? "");
  const val = String(formData.get("val") ?? "").trim();
  if (!stage || (op !== "delete" && !val)) return;
  const where: import("@prisma/client").Prisma.CrmOpportunityWhereInput = {
    archivedAt: null,
    ...(pipeline === "War Room" || pipeline === "" ? { pipeline: { in: ["", "War Room"] } } : { pipeline }),
    stage,
    ...(who && who !== "all" && !who.startsWith("role:") ? { OR: [
      { assignedTo: { equals: who, mode: "insensitive" } },
      { formData: { path: ["__followers"], array_contains: who } },
    ] } : {}),
  };
  if (op === "assign") {
    await db.crmOpportunity.updateMany({ where, data: { assignedTo: val } });
  } else if (op === "stage" && ((await readPipelines()).some((p) => p.stages.some((st) => st.key === val)) || CRM_STAGES.some((s) => s.key === val))) {
    await db.crmOpportunity.updateMany({ where, data: { stage: val, ...(val === "dead" ? { archivedAt: new Date() } : {}) } });
  } else if (op === "pipeline") {
    const target = (await readPipelines()).find((p) => p.name === val);
    if (!target) return;
    const wantStage = String(formData.get("targetStage") ?? "").trim();
    const stage = target.stages.some((s) => s.key === wantStage) ? wantStage : (target.stages[0]?.key ?? "new");
    const own = ownerForPipeline(val);
    await db.crmOpportunity.updateMany({ where, data: { pipeline: val, stage, archivedAt: null, ...(own ? { assignedTo: own } : {}) } });
  } else if (op === "delete") {
    await db.crmOpportunity.updateMany({ where, data: { archivedAt: new Date() } });
  } else if (op === "tag" || op === "untag" || op === "follower") {
    const rows = await db.crmOpportunity.findMany({ where, select: { id: true, tags: true, formData: true }, take: 3000 });
    for (const o of rows) {
      if (op === "tag") {
        if (!o.tags.toLowerCase().includes(val.toLowerCase())) await db.crmOpportunity.update({ where: { id: o.id }, data: { tags: o.tags ? `${o.tags}, ${val}` : val } });
      } else if (op === "untag") {
        const kept = o.tags.split(",").map((t) => t.trim()).filter((t) => t && t.toLowerCase() !== val.toLowerCase()).join(", ");
        if (kept !== o.tags) await db.crmOpportunity.update({ where: { id: o.id }, data: { tags: kept } });
      } else {
        const fd = (o.formData ?? {}) as Record<string, unknown>;
        const cur = Array.isArray(fd.__followers) ? (fd.__followers as string[]) : [];
        await db.crmOpportunity.update({ where: { id: o.id }, data: { formData: { ...fd, __followers: [...new Set([...cur, val])] } as never } });
      }
    }
  } else return;
  revalidatePath("/crm");
}

/** Enroll a lead in an email sequence (needs email perm; stops on reply). */
export async function enrollSequenceAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const { commsFor } = await import("@/lib/crm-comms");
  if (!(await commsFor(me)).email) return;
  const { readSequences, readSeqState, writeSeqState, ymdPlus } = await import("@/lib/crm-templates");
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const seqId = String(formData.get("seqId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!oppId || !contactId || !email) return;
  const seq = (await readSequences()).find((x) => x.id === seqId);
  if (!seq) return;
  const state = await readSeqState();
  state[oppId] = { seqId, step: 0, nextYmd: ymdPlus(seq.steps[0]?.day ?? 0), email, enrolledBy: me.name, startedYmd: new Date().toISOString().slice(0, 10) };
  await writeSeqState(state);
  await logCrmEvent({ contactId, oppId, kind: "system", body: `Enrolled in email sequence "${seq.name}" (${seq.steps.length} steps) — auto-stops the moment they reply`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

export async function unenrollSequenceAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const { readSeqState, writeSeqState } = await import("@/lib/crm-templates");
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const state = await readSeqState();
  if (state[oppId]) {
    delete state[oppId];
    await writeSeqState(state);
    if (contactId) await logCrmEvent({ contactId, oppId, kind: "system", body: "Removed from email sequence", actor: me.name });
  }
  revalidatePath(`/crm/${oppId}`);
}

/** Power dialer: log the outcome of the current queue call and advance. */
export async function dialerOutcomeAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const next = Number(formData.get("next")) || 0;
  // stage-mode dialer (?pl=&stage=) keeps its column after every outcome
  const pl = String(formData.get("pl") ?? "").trim();
  const stage = String(formData.get("stage") ?? "").trim();
  const modeQs = pl && stage ? `&pl=${encodeURIComponent(pl)}&stage=${encodeURIComponent(stage)}` : "";
  if (!oppId || !contactId) return;
  const NEXT_DAYS: Record<string, number> = { no_answer: 1, voicemail: 2, callback: 0, talked: 3, not_interested: 30 };
  const label: Record<string, string> = { no_answer: "no answer", voicemail: "left voicemail", callback: "callback requested", talked: "talked — good convo", not_interested: "not interested (nurture)" };
  if (outcome in NEXT_DAYS) {
    const nf = new Date(Date.now() + NEXT_DAYS[outcome] * 86400000).toISOString().slice(0, 10);
    await db.crmOpportunity.update({ where: { id: oppId }, data: { nextFollowUp: nf, ...(outcome === "not_interested" ? { stage: "nurture" } : {}) } });
    // 🧹 Fold into the call's recording entry if it's already there (one clean timeline row).
    const { foldDispoIntoRecording } = await import("@/lib/call-merge");
    const summary = `📞 ${label[outcome]}${note ? ` — ${note}` : ""} · next follow-up ${nf}`;
    if (!(await foldDispoIntoRecording(contactId, summary)))
      await logCrmEvent({ contactId, oppId, kind: "call", body: `Dialer: ${label[outcome]}${note ? ` — ${note}` : ""} · next follow-up ${nf}`, actor: me.name });
  }
  // 🎙 Disposition decides whether a recording stays filed (Jon 2026-10-26): record it so a
  // later recording.saved can skip Drive, and pull any already-filed recording if it was a VM.
  const { recordCallDispo, removeRecentRecording, NO_KEEP_OUTCOMES } = await import("@/lib/call-dispo");
  await recordCallDispo(contactId, outcome).catch(() => {});
  if (NO_KEEP_OUTCOMES.includes(outcome)) await removeRecentRecording(contactId).catch(() => {});
  revalidatePath("/crm");
  redirect(`/crm/dialer?i=${next}${modeQs}`);
}

/** Managers: create / toggle / delete automation rules. */
export async function saveAutomationAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const { readRules, writeRules } = await import("@/lib/crm-automations");
  type Rule = import("@/lib/crm-automations").CrmRule;
  const rules = await readRules();
  const op = String(formData.get("op") ?? "add");
  if (op === "toggle" || op === "delete") {
    const id = String(formData.get("id") ?? "");
    const i = rules.findIndex((r) => r.id === id);
    if (i >= 0) { if (op === "delete") rules.splice(i, 1); else rules[i].enabled = !rules[i].enabled; await writeRules(rules); }
    revalidatePath("/crm");
    return;
  }
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const trigger = String(formData.get("trigger") ?? ""); // "pipeline::stageKey" or "::stageKey"
  const [pipeline, stage] = trigger.split("::");
  const action = String(formData.get("action") ?? "task") as Rule["action"];
  if (!name || !stage || !["task", "tag", "followup", "enroll"].includes(action)) return;
  rules.push({
    id: Math.random().toString(36).slice(2, 10), name, pipeline: pipeline ?? "", stage, action,
    params: {
      title: String(formData.get("p_title") ?? "").trim().slice(0, 120) || undefined,
      dueDays: Number(formData.get("p_dueDays")) || 0,
      tag: String(formData.get("p_tag") ?? "").trim().slice(0, 40) || undefined,
      days: Number(formData.get("p_days")) || 1,
      seqId: String(formData.get("p_seqId") ?? "") || undefined,
    },
    enabled: true, createdBy: me!.name,
  });
  await writeRules(rules);
  revalidatePath("/crm");
}

/** Managers: create or edit a pipeline — name + its stages, free-typed. */
export async function savePipelineAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const { readGhlPipelinesRaw, writeGhlPipelines, stageSlug } = await import("@/lib/crm");
  const list = await readGhlPipelinesRaw();
  const original = String(formData.get("original") ?? ""); // "" = create new
  const del = formData.get("del") === "1";
  const i = list.findIndex((p) => p.name === original);
  // revalidate BOTH the board and THIS editor page (the bug: only /crm was
  // revalidated, so the pipelines editor Jon was looking at never refreshed and
  // every save looked like it did nothing — Jon 2026-10-24). Flash a result too.
  const done = (flash: string) => { revalidatePath("/crm"); revalidatePath("/crm/pipelines"); redirect(`/crm/pipelines?saved=${flash}`); };
  if (del) {
    if (i >= 0) {
      const count = await db.crmOpportunity.count({ where: { pipeline: original, archivedAt: null } });
      if (count > 0) done(`hasleads:${encodeURIComponent(original)}`); // never orphan live leads — tell them why
      list.splice(i, 1);
      await writeGhlPipelines(list);
    }
    done("deleted");
  }
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  // Prefer stagesJson (each row carries its original KEY so a rename keeps the deals
  // in place — no more orphaning into column 1). Fall back to the plain lines.
  let stages: Array<{ key: string; label: string }> = [];
  try {
    const parsed = JSON.parse(String(formData.get("stagesJson") ?? "[]"));
    if (Array.isArray(parsed)) stages = parsed
      .map((r: { key?: string; label?: string }) => ({ label: String(r?.label ?? "").trim(), key: String(r?.key ?? "").trim() }))
      .filter((r) => r.label)
      .map((r) => ({ key: r.key || stageSlug(r.label), label: r.label }))
      .slice(0, 25);
  } catch { stages = []; }
  if (!stages.length) {
    const stageLines = String(formData.get("stages") ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 25);
    stages = stageLines.map((label) => ({ key: stageSlug(label), label }));
  }
  if (!name || !stages.length) done("empty");
  const entry = { name, stages };
  if (i >= 0) {
    list[i] = entry;
    if (original !== name) await db.crmOpportunity.updateMany({ where: { pipeline: original }, data: { pipeline: name } });
  } else list.push(entry);
  await writeGhlPipelines(list);
  done(i >= 0 ? "saved" : "created");
}

/** Owner/managers: drag-ordered KPIs → sortOrder (10,20,30…). */
export async function saveKpiOrderAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  let ids: string[] = [];
  try { ids = JSON.parse(String(formData.get("order") ?? "[]")); } catch { return; }
  if (!Array.isArray(ids) || ids.length > 60) return;
  for (let i = 0; i < ids.length; i++) {
    await db.kpi.update({ where: { id: String(ids[i]) }, data: { sortOrder: (i + 1) * 10 } }).catch(() => {});
  }
  revalidatePath("/entry");
  revalidatePath("/report");
  revalidatePath("/admin");
}

/** Save one discovery form's answers onto the opportunity. */
export async function saveCrmFormAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const formKey = String(formData.get("formKey") ?? "");
  // Look up the form across ALL form sets — the Developer Buy-Box (dev_buybox) and
  // Buyer-Agent Profile (agent_profile) live in separate exports, not CRM_FORMS, so
  // the old CRM_FORMS-only lookup silently dropped every buy-box save (Jon 2026-10-24).
  const { CRM_FORMS, DISPO_DEV_FORMS, DISPO_AGENT_FORMS } = await import("@/lib/crm-forms");
  const form = [...CRM_FORMS, ...DISPO_DEV_FORMS, ...DISPO_AGENT_FORMS].find((f) => f.key === formKey);
  if (!oppId || !form) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true } });
  if (!opp) return;
  const answers: Record<string, string | string[]> = {};
  for (const f of form.fields) {
    if (f.type === "checks") {
      const vals = formData.getAll(`f_${f.key}`).map(String).filter(Boolean);
      if (vals.length) answers[f.key] = vals;
    } else {
      const v = String(formData.get(`f_${f.key}`) ?? "").trim().slice(0, 1000);
      if (v) answers[f.key] = v;
    }
  }
  const existing = (opp.formData ?? {}) as Record<string, unknown>;
  // 🛟 MERGE into the section, never replace it (Jon 2026-10-26): a partial/stray submit must
  // not wipe fields it didn't carry — this is what made dropdowns look like they "reset".
  const prevSection = (existing[formKey] && typeof existing[formKey] === "object" && !Array.isArray(existing[formKey])) ? (existing[formKey] as Record<string, unknown>) : {};
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...existing, [formKey]: { ...prevSection, ...answers } } as never } });
  // 🧹 Roll repeat edits of the same form into one timeline entry (Jon 2026-10-26).
  const { logEditCoalesced } = await import("@/lib/edit-log");
  await logEditCoalesced({ contactId, oppId, body: `${form.emoji} ${form.name} updated (${Object.keys(answers).length} answers)`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** Card popover: slap a tag on an opportunity instantly. */
export async function addOppTagAction(formData: FormData): Promise<void> {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const tag = String(formData.get("tag") ?? "").trim().slice(0, 40);
  if (!id || !tag) return;
  const o = await db.crmOpportunity.findUnique({ where: { id }, select: { tags: true } });
  if (!o) return;
  if (!o.tags.toLowerCase().split(",").map((t) => t.trim()).includes(tag.toLowerCase())) {
    await db.crmOpportunity.update({ where: { id }, data: { tags: o.tags ? `${o.tags}, ${tag}` : tag } });
  }
  revalidatePath("/crm");
}

/** Softphone outcome quick-log (no redirect — stays in the panel). */
export async function dialerOutcomeQuickAction(formData: FormData): Promise<void> {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  let contactId = String(formData.get("contactId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  // GHL-style dispositions (Jon 2026-10-08) — each one sets the follow-up cadence
  const NEXT_DAYS: Record<string, number> = { no_answer: 1, voicemail: 2, callback: 0, follow_up: 1, appointment: 0, talked: 3, not_interested: 30, wrong_number: -1 };
  const label: Record<string, string> = { no_answer: "no answer", voicemail: "left voicemail", callback: "callback requested", follow_up: "follow up", appointment: "appointment requested", talked: "talked — good convo", not_interested: "not interested (nurture)", wrong_number: "incorrect number" };
  if (!(outcome in NEXT_DAYS)) return;
  // keypad dials carry only the number — the call log already find-or-created
  // the contact, so look them up by last-10 (Jon 2026-10-09)
  if (!contactId) {
    const last10 = String(formData.get("to") ?? "").replace(/\D/g, "").slice(-10);
    if (last10.length === 10) contactId = (await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true } }))?.id ?? "";
  }
  if (!contactId) return;
  const nf = NEXT_DAYS[outcome] < 0 ? "" : new Date(Date.now() + NEXT_DAYS[outcome] * 86400000).toISOString().slice(0, 10);
  if (oppId) await db.crmOpportunity.update({ where: { id: oppId }, data: { nextFollowUp: nf, ...(outcome === "not_interested" ? { stage: "nurture" } : {}) } }).catch(() => {});
  if (outcome === "wrong_number") {
    const c = await db.crmContact.findUnique({ where: { id: contactId }, select: { tags: true } });
    if (c && !/wrong-number/.test(c.tags)) await db.crmContact.update({ where: { id: contactId }, data: { tags: c.tags ? `${c.tags},wrong-number` : "wrong-number" } });
  }
  // 🧹 Fold into the call's recording entry if it's already there (one clean timeline row).
  {
    const { foldDispoIntoRecording } = await import("@/lib/call-merge");
    const summary = `📞 ${label[outcome]}${nf ? ` · next follow-up ${nf}` : ""}`;
    if (!(await foldDispoIntoRecording(contactId, summary)))
      await logCrmEvent({ contactId, oppId, kind: "call", body: `Dialer disposition: ${label[outcome]}${nf ? ` · next follow-up ${nf}` : ""}`, actor: me.name });
  }
  // 🎙 Disposition decides whether the recording stays filed (Jon 2026-10-26).
  const { recordCallDispo, removeRecentRecording, NO_KEEP_OUTCOMES } = await import("@/lib/call-dispo");
  await recordCallDispo(contactId, outcome).catch(() => {});
  if (NO_KEEP_OUTCOMES.includes(outcome)) await removeRecentRecording(contactId).catch(() => {});
  revalidatePath("/crm");
}

/** Managers: save the snippet library (one per line pipe format). */
export async function saveSnippetsAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const { writeSnippets } = await import("@/lib/crm-templates");
  type Snip = import("@/lib/crm-templates").Snippet;
  const raw = String(formData.get("raw") ?? "");
  const list: Snip[] = [];
  for (const line of raw.split("\n")) {
    const [kind, name, subject, ...rest] = line.split("|");
    const body = rest.join("|").trim();
    if (!["sms", "email"].includes((kind ?? "").trim()) || !name?.trim() || !body) continue;
    list.push({ id: `${kind.trim()}-${list.length}`, kind: kind.trim() as Snip["kind"], name: name.trim().slice(0, 60), subject: subject?.trim() || undefined, body: body.replaceAll("\\n", "\n").slice(0, 2000) });
  }
  if (list.length) await writeSnippets(list);
  revalidatePath("/crm");
}

/** Browser-dialer call ended → one timeline row with the duration. */
export async function logBrowserCallAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const contactId = String(formData.get("contactId") ?? "");
  const oppId = String(formData.get("oppId") ?? "");
  const secs = Number(formData.get("secs")) || 0;
  const to = String(formData.get("to") ?? "");
  // Keypad dials to numbers NOT in contacts used to vanish (Jon 2026-10-08:
  // "I called myself and have nowhere to see it") — find-or-create the
  // contact so EVERY call lands in Conversations like a phone's recents.
  let cId = contactId;
  if (!cId && to) {
    const last10 = to.replace(/\D/g, "").slice(-10);
    if (last10.length === 10) {
      const found = await db.crmContact.findFirst({ where: { phone: { contains: last10 } }, select: { id: true } });
      cId = found?.id ?? (await db.crmContact.create({ data: { name: to, phone: `+1${last10}`, source: "Dialed from keypad", assignedTo: me.name } })).id;
    }
  }
  if (!cId) return;
  await logCrmEvent({
    contactId: cId, oppId, kind: "call",
    body: `Browser call → ${to}${secs ? ` · ${Math.floor(secs / 60)}m ${secs % 60}s` : " · no answer"}`,
    meta: { secs, via: "telnyx-webrtc" }, actor: me.name,
  });
  revalidatePath(`/crm/${oppId}`);
  revalidatePath("/crm/conversations");
}

/** Attach a party to the deal — listing agent, escrow, title, attorney… */
export async function addCrmPartyAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!oppId || !name) return;
  await db.crmParty.create({ data: {
    oppId, name,
    role: String(formData.get("role") ?? "").trim().slice(0, 40),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    note: String(formData.get("note") ?? "").trim().slice(0, 200),
    createdBy: me.name,
  } });
  revalidatePath(`/crm/${oppId}`);
}

export async function deleteCrmPartyAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const p = await db.crmParty.findUnique({ where: { id } });
  if (!p) return;
  await db.crmParty.delete({ where: { id } }).catch(() => {});
  revalidatePath(`/crm/${p.oppId}`);
}

/** Telnyx click-to-call: rings the rep's phone first, then bridges the lead.
 *  Needs TELNYX_CONNECTION_ID (Call Control app) + the rep's phone on file —
 *  until then the UI offers tel: dialing and manual logging. */
export async function telnyxCallAction(formData: FormData): Promise<{ ok: boolean; msg: string }> {
  const me = await crmUser();
  if (!me) return { ok: false, msg: "no access" };
  const { commsFor } = await import("@/lib/crm-comms");
  if (!(await commsFor(me)).call) return { ok: false, msg: "Calling isn't enabled for you — ask Jon." };
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const to = String(formData.get("to") ?? "").replace(/[^+\d]/g, "");
  const key = process.env.TELNYX_API_KEY;
  const conn = process.env.TELNYX_CONNECTION_ID;
  const from = process.env.TELNYX_CALLER_ID;
  const repPhone = String(formData.get("repPhone") ?? "").replace(/[^+\d]/g, "");
  if (!key || !conn || !from) return { ok: false, msg: "Telnyx dialer not armed yet — set TELNYX_CONNECTION_ID + TELNYX_CALLER_ID in Vercel (setup guide on the card). Use 📱 tel: for now." };
  if (!to || !repPhone) return { ok: false, msg: "Need both the lead's number and your phone number (set it on /account)." };
  try {
    const res = await fetch("https://api.telnyx.com/v2/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ connection_id: conn, to: repPhone, from, client_state: Buffer.from(JSON.stringify({ bridgeTo: to, oppId, contactId, rep: me.name })).toString("base64"), webhook_url: "https://kpi-tracker-lovat.vercel.app/api/telnyx/call" }),
    });
    if (!res.ok) return { ok: false, msg: `Telnyx: ${res.status} ${(await res.text()).slice(0, 120)}` };
    if (contactId) await logCrmEvent({ contactId, oppId, kind: "call", body: `Click-to-call started → ${to}`, actor: me.name });
    return { ok: true, msg: "📞 Your phone is ringing — answer and we bridge the seller in." };
  } catch (e) { return { ok: false, msg: String(e).slice(0, 140) }; }
}

/** Shared PandaDoc drafter: cash vs novation template, timeline log + task. */
async function draftContract(oppId: string, kind: string, actor: string): Promise<{ ok: boolean; msg: string; url?: string }> {
  const { pandadocConfigured, createOfferDraft, PANDADOC_TEMPLATES, PANDADOC_DRAFTING_ENABLED } = await import("@/lib/pandadoc");
  if (!PANDADOC_DRAFTING_ENABLED) return { ok: false, msg: "PandaDoc contract drafting is turned off (its API charges per document). Create the contract directly in PandaDoc, or re-enable drafting once credits are added." };
  if (!pandadocConfigured()) return { ok: false, msg: "PandaDoc key missing" };
  const tpl = PANDADOC_TEMPLATES[kind] ?? PANDADOC_TEMPLATES.cash;
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, include: { contact: true } });
  if (!opp) return { ok: false, msg: "lead not found" };
  const c = opp.contact;
  const price = opp.value ?? opp.askPrice;
  // Jon's 5 essentials: address, APN (from the discovery forms), seller net
  // (underwriting-approved number = deal value), seller full name.
  const fd = (opp.formData ?? {}) as Record<string, Record<string, string>>;
  const apn = fd.property?.apn || fd.land?.apn || "";
  const net = price != null ? `$${price.toLocaleString()}` : "";
  const r = await createOfferDraft({
    name: `${kind === "novation" ? "Novation" : "Cash"} offer — ${c.name}${c.address ? ` — ${c.address}` : ""}`,
    recipientEmail: c.email, recipientName: c.name, templateId: tpl.id,
    tokens: {
      "Seller.Name": c.name, "Property.Address": c.address, "APN": apn,
      "Seller.Net": net, "Offer.Price": net, "Rep.Name": opp.assignedTo || actor,
    },
    metadata: { oppId: opp.id, contactId: c.id, kind },
  });
  if (r.id) {
    await logCrmEvent({ contactId: c.id, oppId: opp.id, kind: "system", body: `📝 ${kind === "novation" ? "NOVATION" : "CASH"} contract DRAFTED (${tpl.label}) — review & send: https://app.pandadoc.com/a/#/documents/${r.id}`, actor: "pandadoc" });
    await db.crmTask.create({ data: { oppId: opp.id, contactId: c.id, title: `📝 Review & send the drafted ${kind} contract (PandaDoc)`, due: new Date().toISOString().slice(0, 10), assignedTo: opp.assignedTo || actor, createdBy: "pandadoc" } }).catch(() => {});
    revalidatePath(`/crm/${opp.id}`);
    return { ok: true, msg: "drafted", url: `https://app.pandadoc.com/a/#/documents/${r.id}` };
  }
  await logCrmEvent({ contactId: c.id, oppId: opp.id, kind: "system", body: `PandaDoc ${kind} draft failed: ${r.error}`, actor: "pandadoc" });
  revalidatePath(`/crm/${opp.id}`);
  return { ok: false, msg: r.error ?? "failed" };
}

/** 📤 Queue the send to matching cash buyers from a land lead (Jon 2026-10-20). Does
 *  NOT auto-email (the land flow markets before signing + a human sends): it creates a
 *  tracked dispo task with a ready-to-send blast message + the ranked buyers' contacts,
 *  and logs the timeline. Marketing-access gated. Returns {ok, count}. */
export async function sendToMatchingBuyersAction(_prev: { ok: boolean; count: number; msg?: string } | null, formData: FormData): Promise<{ ok: boolean; count: number; msg?: string }> {
  const me = await crmUser();
  const { canAccessMarketing } = await import("@/lib/auth");
  if (!me || !canAccessMarketing(me)) return { ok: false, count: 0, msg: "no access" };
  const oppId = String(formData.get("oppId") ?? "");
  if (!oppId) return { ok: false, count: 0, msg: "no lead" };
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { id: true, title: true, assignedTo: true, value: true, askPrice: true, contactId: true, formData: true, contact: { select: { name: true, address: true } } } });
  if (!opp) return { ok: false, count: 0, msg: "lead not found" };
  const addr = opp.contact.address || opp.title || "the property";
  const price = opp.value ?? opp.askPrice;
  const fd = (opp.formData ?? {}) as Record<string, Record<string, string | string[]>>;
  const featuresArr = Array.isArray(fd.land?.features) ? (fd.land!.features as string[]) : [];
  const { getBuyerMatchesForLead } = await import("@/lib/buyer-match-lead");
  const matches = await getBuyerMatchesForLead(addr, price, featuresArr);
  if (!matches.length) return { ok: false, count: 0, msg: "No vetted buyers match this area/price yet — add buyers in Buyer Research." };

  const feats = featuresArr.join(", ");
  // acres for the blast — prefer the new single "acreage" field, fall back to any legacy "lot"
  const acRaw = String(fd.land?.acreage ?? fd.land?.lot ?? "").trim();
  const lot = acRaw ? (/ac/i.test(acRaw) ? acRaw : `${acRaw} ac`) : "";
  const blast = `🏞 Land available: ${addr}${price != null ? ` — asking ${`$${price.toLocaleString()}`}` : ""}${lot ? ` · ${lot}` : ""}${feats ? `\nFeatures: ${feats}` : ""}\nCash/fast close preferred. Interested or want details? Reply here.`;
  const list = matches.map((b, i) => `${i + 1}. ${b.name}${b.topPrice != null ? ` (to $${Math.round(b.topPrice / 1000)}k)` : ""}${b.phone ? ` · ${b.phone}` : ""}${b.email ? ` · ${b.email}` : ""}${b.reasons.length ? ` — ${b.reasons.join(", ")}` : ""}`).join("\n");

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const task = await db.crmTask.create({ data: { oppId: opp.id, contactId: opp.contactId, title: `📤 Send ${addr} to ${matches.length} matching buyer${matches.length > 1 ? "s" : ""} — top-down`, due: today, assignedTo: opp.assignedTo || me.name, createdBy: "buyer-send" } }).catch(() => null);
  if (task) { const { writeTaskNote } = await import("@/lib/task-notes"); await writeTaskNote(task.id, `Ready-to-send message:\n${blast}\n\nMatching buyers (send top-down):\n${list}`).catch(() => {}); }
  await logCrmEvent({ contactId: opp.contactId, oppId: opp.id, kind: "system", body: `📤 Queued send to ${matches.length} matching cash buyers (${matches.slice(0, 3).map((b) => b.name.split(" ")[0]).join(", ")}${matches.length > 3 ? "…" : ""}) — task created for ${opp.assignedTo || me.name}`, actor: "buyer-send" }).catch(() => {});
  // 📇 Auto-seed the per-deal follow-up tracker so the chase starts itself — these
  // buyers land as "contacted", next follow-up in 2 days (Jon 2026-10-20).
  await mutateDispoBuyers(opp.id, (cur) => {
    const have = new Set(cur.map((r) => String(r.name).toLowerCase()));
    const add = matches.filter((b) => !have.has(b.name.toLowerCase())).map((b) => ({
      id: `db_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: b.name, kind: "developer", phone: b.phone || undefined, email: b.email || undefined,
      buyerId: b.id, stage: "contacted", lastContact: today, nextFollowUp: ymdAdd(2), addedAt: today,
      price: b.topPrice != null ? `to $${Math.round(b.topPrice / 1000)}k` : undefined,
    }));
    return [...cur, ...add];
  }).catch(() => {});

  // ⚡ One-click launch through DirectREI's dialer/email/SMS automations, when the
  // write API is live (Jon 2026-10-22). Human already reviewed + clicked; this fires
  // the blast so dispo doesn't rebuild the list in DirectREI by hand. OFF until the
  // endpoints ship — then it just starts working, no deploy.
  let launched: { campaignId?: string; queued?: number; error?: string } | null = null;
  try {
    const { directReiBlastConfigured, directReiLaunchBlast } = await import("@/lib/directrei");
    if (directReiBlastConfigured()) {
      const contacts = matches
        .filter((b) => b.phone || b.email)
        .map((b) => ({ name: b.name, phone: b.phone || undefined, email: b.email || undefined, external_id: `${opp.id}:${b.id}` }));
      launched = await directReiLaunchBlast({
        name: `Deal Blast — ${addr} (War Room)`,
        channels: ["sms", "email", "cold_call"],
        message: { sms: blast, email_subject: `Off-market land: ${addr}`, email_body: blast.replace(/\n/g, "<br>") },
        contacts,
      });
      if (launched.campaignId && !launched.error) {
        const fd2 = (opp.formData ?? {}) as Record<string, unknown>;
        await db.crmOpportunity.update({ where: { id: opp.id }, data: { formData: { ...fd2, __directReiBlast: { campaignId: launched.campaignId, queued: launched.queued ?? contacts.length, at: new Date().toISOString() } } as never } }).catch(() => {});
      }
      await logCrmEvent({ contactId: opp.contactId, oppId: opp.id, kind: "system", body: launched.error ? `⚡ DirectREI blast FAILED — ${launched.error} (buyers still queued on the tracker to work by hand)` : `⚡ Deal Blast launched via DirectREI — ${launched.queued ?? contacts.length} buyers queued (SMS · email · cold call). Replies will land on this deal.`, actor: "buyer-send" }).catch(() => {});
    }
  } catch { /* never let a blast error break the arm */ }

  revalidatePath(`/crm/${opp.id}`);
  return { ok: true, count: matches.length, msg: launched?.campaignId && !launched.error ? `launched ${launched.queued ?? matches.length} via DirectREI` : undefined };
}

/** Card buttons: 📝 Draft cash / novation contract on demand. */
export async function draftContractAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const kind = String(formData.get("kind") ?? "cash") === "novation" ? "novation" : "cash";
  if (!oppId) return;
  await draftContract(oppId, kind, me.name);
}

/** useActionState variant → surfaces the result so the button shows success +
 *  the PandaDoc link, or the real error (e.g. "out of document credits"), instead
 *  of failing silently (Jon 2026-10-20). */
export async function draftOfferAction(_prev: { ok: boolean; msg: string; url?: string } | null, formData: FormData): Promise<{ ok: boolean; msg: string; url?: string }> {
  const me = await crmUser();
  if (!me) return { ok: false, msg: "not signed in" };
  const oppId = String(formData.get("oppId") ?? "");
  const kind = String(formData.get("kind") ?? "cash") === "novation" ? "novation" : "cash";
  if (!oppId) return { ok: false, msg: "no lead" };
  const r = await draftContract(oppId, kind, me.name);
  // Make the common out-of-credits case read in plain English.
  if (!r.ok && /402|credit|limit|quota|payment/i.test(r.msg)) {
    return { ...r, msg: "PandaDoc is out of document credits — add credits / upgrade the plan in PandaDoc, then try again." };
  }
  return r;
}

/** 📦 Contacts page mass edit (managers): owner / tags / stage / pipeline
 *  across every checked contact (and their open opportunities). */
export async function bulkContactsAction(formData: FormData) {
  const me = await crmUser();
  if (!me || !isManager(me)) return;
  let ids: string[] = formData.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) { try { ids = JSON.parse(String(formData.get("idsJson") ?? "[]")); } catch { /* none */ } }
  const op = String(formData.get("op") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  if (!ids.length || !op) return;
  for (const contactId of ids.slice(0, 500)) {
    if (op === "owner") {
      await db.crmContact.update({ where: { id: contactId }, data: { assignedTo: value } }).catch(() => {});
      await db.crmOpportunity.updateMany({ where: { contactId, archivedAt: null }, data: { assignedTo: value } }).catch(() => {});
    } else if (op === "addtag" && value) {
      const c = await db.crmContact.findUnique({ where: { id: contactId }, select: { tags: true } });
      const tags = new Set((c?.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean));
      tags.add(value);
      await db.crmContact.update({ where: { id: contactId }, data: { tags: [...tags].join(",").slice(0, 300) } }).catch(() => {});
      const opps = await db.crmOpportunity.findMany({ where: { contactId, archivedAt: null }, select: { id: true, tags: true } });
      for (const o of opps) {
        const ot = new Set((o.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean)); ot.add(value);
        await db.crmOpportunity.update({ where: { id: o.id }, data: { tags: [...ot].join(",").slice(0, 300) } }).catch(() => {});
      }
    } else if (op === "stage" && value) {
      await db.crmOpportunity.updateMany({ where: { contactId, archivedAt: null }, data: { stage: value } }).catch(() => {});
    } else if (op === "pipeline") {
      await db.crmOpportunity.updateMany({ where: { contactId, archivedAt: null }, data: { pipeline: value === "War Room" ? "" : value } }).catch(() => {});
    }
  }
  revalidatePath("/crm/contacts");
  revalidatePath("/crm");
}

/** Anyone on the CRM can hand a lead to another rep (GHL-style owner field).
 *  Updates the opp + contact and leaves a timeline note. */
export async function setOppOwnerAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const owner = String(formData.get("owner") ?? "").trim();
  if (!id) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id }, select: { contactId: true, assignedTo: true } });
  if (!opp || opp.assignedTo === owner) return;
  await db.crmOpportunity.update({ where: { id }, data: { assignedTo: owner } });
  await db.crmContact.update({ where: { id: opp.contactId }, data: { assignedTo: owner } }).catch(() => {});
  await logCrmEvent({ contactId: opp.contactId, oppId: id, kind: "system", body: `👤 Owner: ${opp.assignedTo || "unassigned"} → ${owner || "unassigned"}`, actor: me.name });
  revalidatePath("/crm");
  revalidatePath(`/crm/${id}`);
}

/** Followers (GHL-style): extra teammates who can SEE a lead that isn't
 *  theirs. Stored in formData.__followers — no schema change. */
export async function toggleFollowerAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const remove = String(formData.get("remove") ?? "") === "1";
  if (!id || !name) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id }, select: { contactId: true, formData: true } });
  if (!opp) return;
  const fd = (opp.formData ?? {}) as Record<string, unknown>;
  const cur = Array.isArray(fd.__followers) ? (fd.__followers as string[]) : [];
  const next = remove ? cur.filter((n) => n !== name) : [...new Set([...cur, name])];
  await db.crmOpportunity.update({ where: { id }, data: { formData: { ...fd, __followers: next } as never } });
  await logCrmEvent({ contactId: opp.contactId, oppId: id, kind: "system", body: remove ? `👣 ${name.split(" ")[0]} unfollowed` : `👣 ${name.split(" ")[0]} added as follower`, actor: me.name });
  revalidatePath(`/crm/${id}`);
}

/** 🏷 Call-type disposition → KPI auto-entry (Jon 2026-10-12): after a ≥60s
 *  call the rep tags WHAT KIND of call it was; that +1s the matching KPI that
 *  previously had to be typed into the scorecard by hand. */
export async function logCallTypeKpiAction(formData: FormData): Promise<{ ok: boolean; label?: string; error?: string }> {
  const me = await crmUser();
  if (!me) return { ok: false, error: "no access" };
  const type = String(formData.get("type") ?? "");
  const MAP: Record<string, { keys: string[]; nameLike: string; label: string }> = {
    process: { keys: ["completed_process_calls"], nameLike: "process call", label: "Process Call" },
    followup: { keys: ["follow_up_calls", "followup_calls"], nameLike: "follow", label: "Follow-Up Call" },
    offer: { keys: ["offer_calls"], nameLike: "offer call", label: "Offer Call" },
    buyer_convo: { keys: ["dev_conversations", "buyer_conversations"], nameLike: "buyer conversation", label: "Buyer Conversation" },
    buyer_vetted: { keys: ["buyers_vetted"], nameLike: "vetted", label: "Buyer Vetted" },
  };
  const m = MAP[type];
  if (!m) return { ok: false, error: "unknown type" };
  let kpi: { id: string; name: string } | null = null;
  for (const k of m.keys) {
    kpi = await db.kpi.findUnique({ where: { key: k }, select: { id: true, name: true } });
    if (kpi) break;
  }
  if (!kpi) kpi = await db.kpi.findFirst({ where: { name: { contains: m.nameLike, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!kpi) return { ok: false, error: `no "${m.label}" KPI found` };
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const existing = await db.entry.findFirst({ where: { kpiId: kpi.id, userId: me.id, date } });
  if (existing) await db.entry.update({ where: { id: existing.id }, data: { value: existing.value + 1 } });
  else await db.entry.create({ data: { kpiId: kpi.id, userId: me.id, date, value: 1, enteredBy: "dialer" } });
  // breadcrumb on the lead when we know who the call was with
  const to10 = String(formData.get("to") ?? "").replace(/\D/g, "").slice(-10);
  if (to10.length === 10) {
    const c = await db.crmContact.findFirst({ where: { phone: { contains: to10 } }, select: { id: true } });
    if (c) await logCrmEvent({ contactId: c.id, kind: "call", body: `🏷 Call type: ${m.label} (+1 ${kpi.name})`, actor: me.name }).catch(() => {});
  }
  return { ok: true, label: `${m.label} → +1 ${kpi.name}` };
}

/** 🔀 Move an opp to a DIFFERENT pipeline (Jon 2026-10-13: team can move
 *  between pipelines, not just stages). Lands on the target pipeline's first
 *  stage and auto-assigns to that pipeline's owner when one is defined. */
// Derive the auto-owner from a pipeline NAME (robust to emoji/prefix renames —
// the old hardcoded "🔥 AQM:" map went stale when pipelines were renamed to
// "💰 AQ:"). Only the per-rep acquisitions pipelines auto-assign an owner.
function ownerForPipeline(name: string): string {
  const n = (name || "").toLowerCase();
  // Dispositions pipelines (the "DS: …" boards) are owned by Sharyn — the deal is
  // signed and handed off to dispo (Jon 2026-10-20). The acquisitions rep who moved
  // it + Marie (backup dispo) are added as followers in setOppPipelineAction.
  if (isDispoPipeline(name)) return "Sharyn Kayle";
  if (n.includes("michelle")) return "Michelle Lagudas";
  if (n.includes("nick")) return "Nicholas Fair"; // renamed from Nick → Nicholas (Jon 2026-10-15)
  return "";
}

// A "DS: …" pipeline = dispositions (e.g. "DS: Signed Go Close", "DS: Sell Land
// Then Sign"). Owner → Sharyn, backup follower → Marie.
const DISPO_OWNER = "Sharyn Kayle";
const DISPO_BACKUP = "Marie Badayos";
function isDispoPipeline(name: string): boolean {
  return /^\s*ds[:\s]/i.test(name || "");
}
export async function setOppPipelineAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const pipeline = String(formData.get("pipeline") ?? "").trim();
  if (!id || !pipeline) return;
  const pipes = await readPipelines();
  const target = pipes.find((p) => p.name === pipeline);
  if (!target) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id }, select: { contactId: true, pipeline: true, stage: true, assignedTo: true, formData: true } });
  if (!opp) return;
  // Honor a chosen destination stage if it's valid for the target pipeline
  // (Nick's ticket 2026-10-15); otherwise fall back to the pipeline's first stage.
  const wantStage = String(formData.get("stage") ?? "").trim();
  const firstStage = (wantStage && target.stages.some((s) => s.key === wantStage) ? wantStage : target.stages[0]?.key) ?? opp.stage;
  const owner = ownerForPipeline(pipeline);

  // 🤝 Dispo handoff (Jon 2026-10-20): moving a lead into a "DS: …" pipeline means
  // the contract is signed and it's handed to dispositions. Owner → Sharyn; the
  // acquisitions rep who moved it (= whoever signed/owns the lead) becomes a
  // follower, and Marie (backup dispo) is always added. Followers live in
  // formData.__followers — no schema change.
  let data: Record<string, unknown> = { pipeline, stage: firstStage, archivedAt: null, ...(owner ? { assignedTo: owner } : {}) };
  let followNote = "";
  if (isDispoPipeline(pipeline)) {
    const fd = (opp.formData ?? {}) as Record<string, unknown>;
    const cur = Array.isArray(fd.__followers) ? (fd.__followers as string[]) : [];
    const add = [me.name, DISPO_BACKUP].filter((n) => n && n !== DISPO_OWNER); // don't follow yourself if Sharyn moved it
    const next = [...new Set([...cur, ...add])];
    data = { ...data, formData: { ...fd, __followers: next } };
    followNote = ` · acq rep ${me.name.split(" ")[0]}${add.includes(DISPO_BACKUP) ? " · +Marie backup" : ""}`;
  }
  await db.crmOpportunity.update({ where: { id }, data: data as never });
  await logCrmEvent({ contactId: opp.contactId, oppId: id, kind: "stage", body: `📂 Moved ${opp.pipeline || "War Room"} → ${pipeline}${owner ? ` · owner ${owner}` : ""}${followNote}`, actor: me.name });
  revalidatePath("/crm");
}

/** 🔀 Reorder the pipeline tabs (Jon 2026-10-13: drag/move pipelines, not just
 *  rename). dir "up"/"down" swaps a pipeline with its neighbor in the stored
 *  order (the War Room + DNC built-ins aren't in the stored list). */
// 🔧 Re-sort deals whose stored stage no longer matches any stage in their pipeline
// (Jon 2026-10-24). Renaming a pipeline's stages changes the stage KEYS, so every
// deal's old key becomes orphaned → the board dumps them all into the first column
// and "select whole stage" counts 0. This remaps each orphan to the best-matching
// CURRENT stage by comparing the old key's words to each stage's key+label (so a
// deal whose old stage was "deal_won" lands in "Closed / Won", "escrow_opened" →
// "Escrow Opened", etc.); anything with no word overlap stays in the first stage.
const stageTokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !["the", "and", "new"].includes(t)));
export async function resortOrphanStagesAction(formData: FormData) {
  const me = await getCurrentUser();
  const { canManageAllLeads } = await import("@/lib/auth");
  if (!canManageAllLeads(me)) return;
  const pipeline = String(formData.get("pipeline") ?? "");
  const back = String(formData.get("back") ?? "/dispo?tab=deals");
  if (!pipeline) redirect(back);
  const pls = await readPipelines();
  const pl = pls.find((p) => p.name === pipeline);
  if (!pl || !pl.stages.length) redirect(back);
  const keys = new Set(pl!.stages.map((s) => s.key));
  const opps = await db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline, stage: { notIn: [...keys] } }, select: { id: true, stage: true }, take: 3000 });
  let moved = 0;
  for (const o of opps) {
    const ot = stageTokens(o.stage || "");
    let best = pl!.stages[0], bestScore = 0;
    for (const s of pl!.stages) {
      const st = stageTokens(`${s.key} ${s.label}`);
      let score = 0; for (const t of ot) if (st.has(t)) score++;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    await db.crmOpportunity.update({ where: { id: o.id }, data: { stage: best.key } });
    moved++;
  }
  revalidatePath("/dispo");
  redirect(`${back}${back.includes("?") ? "&" : "?"}resorted=${moved}`);
}

// 💾 Save ALL pipelines in one shot (Jon 2026-10-24: "one save button, not one per
// pipeline"). Takes the whole editor state as JSON [{original,name,stages:[{key,label}]}],
// preserves stage KEYS (so renames don't orphan deals), applies pipeline renames to
// their opps, and keeps War Room fixed + never drops a pipeline that still has leads.
export async function saveAllPipelinesAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const { readGhlPipelinesRaw, writeGhlPipelines, stageSlug } = await import("@/lib/crm");
  let payload: Array<{ original?: string; name?: string; group?: string; stages?: Array<{ key?: string; label?: string }> }> = [];
  try { const j = JSON.parse(String(formData.get("payload") ?? "[]")); if (Array.isArray(j)) payload = j; } catch { payload = []; }
  const cur = await readGhlPipelinesRaw();
  const war = cur.filter((p) => p.name === "War Room"); // fixed — powers the land SOP
  // apply renames to opps first
  for (const p of payload) {
    const name = String(p.name ?? "").trim();
    if (p.original && name && p.original !== name) await db.crmOpportunity.updateMany({ where: { pipeline: p.original }, data: { pipeline: name } });
  }
  const built = payload
    .map((p) => ({ name: String(p.name ?? "").trim().slice(0, 60), stages: (Array.isArray(p.stages) ? p.stages : []).map((s) => ({ label: String(s?.label ?? "").trim(), key: String(s?.key ?? "").trim() })).filter((s) => s.label).map((s) => ({ key: s.key || stageSlug(s.label), label: s.label })).slice(0, 25) }))
    .filter((p) => p.name && p.stages.length && p.name !== "War Room");
  // never silently drop a pipeline that still has live leads but wasn't in the editor
  const keepNames = new Set([...built.map((b) => b.name), ...payload.map((p) => String(p.original ?? "")).filter(Boolean)]);
  const rescued: typeof built = [];
  for (const c of cur) {
    if (c.name === "War Room" || keepNames.has(c.name)) continue;
    const count = await db.crmOpportunity.count({ where: { pipeline: c.name, archivedAt: null } }).catch(() => 1);
    if (count > 0) rescued.push(c);
  }
  await writeGhlPipelines([...war, ...built, ...rescued]);
  // 🗂 Persist each pipeline's CRM (Acquisitions / Dispositions) so routing uses the
  // explicit choice, not name-pattern guessing (Jon 2026-10-24).
  try {
    const { writePipelineCrm } = await import("@/lib/pipeline-crm");
    const crm: Record<string, "acquisitions" | "dispositions"> = {};
    for (const p of payload) { const name = String(p.name ?? "").trim(); if (name && (p.group === "acquisitions" || p.group === "dispositions")) crm[name] = p.group; }
    await writePipelineCrm(crm);
  } catch { /* non-blocking */ }
  revalidatePath("/crm");
  revalidatePath("/crm/pipelines");
  redirect("/crm/pipelines?saved=all");
}

// 🔗 Backfill: make sure every lead currently in a Closed/Won stage of a dispo deal
// pipeline has a closed Deal on the Deals board (Jon 2026-10-24: the rename broke the
// auto-generation, so some Closed/Won leads never reached the board). Idempotent via
// the __dealGenerated flag, so it never double-counts revenue.
export async function syncClosedDealsAction(formData: FormData) {
  const me = await crmUser();
  const { canManageAllLeads } = await import("@/lib/auth");
  if (!me || !canManageAllLeads(me)) return;
  const back = String(formData.get("back") ?? "/dispo?tab=deals&view=closed");
  const { isDispoDealPipeline } = await import("@/lib/dispo-buyers");
  const pls = (await readPipelines()).filter((p) => isDispoDealPipeline(p.name));
  const wonKeys = new Set<string>();
  for (const p of pls) for (const s of p.stages) {
    const t = `${s.key} ${s.label}`;
    if (/won/i.test(t) && !/dead|died|lost|nurtur/i.test(t)) wonKeys.add(s.key);
  }
  const today = PT_TODAY();
  let made = 0;
  if (wonKeys.size) {
    const opps = await db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: pls.map((p) => p.name) }, stage: { in: [...wonKeys] } }, select: { id: true, title: true, pipeline: true, assignedTo: true, value: true, askPrice: true, contactId: true, formData: true, contact: { select: { name: true, address: true } } } });
    for (const o of opps) {
      const fd = (o.formData ?? {}) as Record<string, unknown>;
      if (fd.__dealGenerated) continue;
      const addr = o.contact?.address || o.title || o.contact?.name || "Deal";
      await db.deal.create({ data: { address: addr, status: "closed", assignedTo: o.assignedTo || me.name, soldPrice: o.value ?? o.askPrice ?? null, assignmentFee: o.value ?? null, soldDate: today, source: "dispo-crm", notes: `Backfilled from ${o.pipeline} → Closed/Won.` } }).catch(() => {});
      await db.crmOpportunity.update({ where: { id: o.id }, data: { formData: { ...fd, __dealGenerated: today } as never } }).catch(() => {});
      made++;
    }
  }
  revalidatePath("/deals");
  revalidatePath("/dispo");
  redirect(`${back}${back.includes("?") ? "&" : "?"}synced=${made}`);
}

export async function reorderPipelineAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!isManager(me)) return;
  const { readGhlPipelinesRaw, writeGhlPipelines } = await import("@/lib/crm");
  const list = await readGhlPipelinesRaw();
  const name = String(formData.get("name") ?? "");
  const dir = String(formData.get("dir") ?? "");
  const i = list.findIndex((p) => p.name === name);
  if (i < 0) return;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await writeGhlPipelines(list);
  revalidatePath("/crm");
  revalidatePath("/crm/pipelines");
}

// ── Conversations rail: edit contact + manage multiple properties/parcels ──
// Jon 2026-10-13: the Conversations right rail is now a full editor so a random
// inbound number is never lost. Names stay as ONE merged `name` field (so the
// opportunity card is unchanged — it shows "First Last"); the editor just
// exposes first + last separately. Each parcel of land is its OWN opportunity
// (a contact can have many), with its APN in formData.property.apn and its own
// notes scoped by oppId — so a seller with 10 parcels gets 10 tracked lands.
export async function saveConvContactAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const first = String(formData.get("firstName") ?? "").trim();
  const last = String(formData.get("lastName") ?? "").trim();
  const name = `${first} ${last}`.trim();
  await db.crmContact.update({ where: { id }, data: {
    ...(name ? { name } : {}),
    phone: String(formData.get("phone") ?? "").trim(),
    altPhone: String(formData.get("altPhone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    assignedTo: String(formData.get("assignedTo") ?? "").trim(),
    pinnedNote: String(formData.get("pinnedNote") ?? "").trim().slice(0, 300),
  } });
  await logCrmEvent({ contactId: id, oppId: "", kind: "system", body: `Contact details updated by ${me.name.split(" ")[0]}`, actor: me.name });
  revalidatePath("/crm/conversations");
  revalidatePath("/crm");
}

// Add another parcel/property for a contact → a brand-new opportunity.
export async function addPropertyAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const contactId = String(formData.get("contactId") ?? "");
  if (!contactId) return;
  const { formatAddress } = await import("@/lib/address");
  const address = formatAddress(String(formData.get("address") ?? ""));
  const apn = String(formData.get("apn") ?? "").trim();
  const title = address || (apn ? `APN ${apn}` : "New property");
  const note = String(formData.get("note") ?? "").trim();
  const c = await db.crmContact.findUnique({ where: { id: contactId }, select: { assignedTo: true } });
  const opp = await db.crmOpportunity.create({ data: {
    contactId, title, stage: "new",
    assignedTo: c?.assignedTo || me.name,
    ...(apn ? { formData: { property: { apn } } } : {}),
  } });
  await logCrmEvent({ contactId, oppId: opp.id, kind: "system", body: `➕ Property added: ${title}${apn ? ` · APN ${apn}` : ""}`, actor: me.name });
  if (note) await logCrmEvent({ contactId, oppId: opp.id, kind: "note", body: note, actor: me.name });
  revalidatePath("/crm/conversations");
  revalidatePath("/crm");
}

// Inline-save one parcel's address (opp title) + APN (formData.property.apn).
export async function savePropertyAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const { formatAddress } = await import("@/lib/address");
  const address = formatAddress(String(formData.get("address") ?? ""));
  const apn = String(formData.get("apn") ?? "").trim();
  const existing = await db.crmOpportunity.findUnique({ where: { id }, select: { formData: true } });
  const fd = (existing?.formData ?? {}) as Record<string, unknown>;
  const prevProp = (fd.property ?? {}) as Record<string, unknown>;
  await db.crmOpportunity.update({ where: { id }, data: {
    ...(address ? { title: address } : {}),
    formData: { ...fd, property: { ...prevProp, apn } },
  } });
  revalidatePath("/crm/conversations");
  revalidatePath(`/crm/${id}`);
}

// Quick note scoped to ONE parcel (so each land tracks its own history).
export async function addPropertyNoteAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!contactId || !body) return;
  await logCrmEvent({ contactId, oppId, kind: "note", body, actor: me.name });
  revalidatePath("/crm/conversations");
  revalidatePath(`/crm/${oppId}`);
}

// ===== 📇 Per-deal buyer-agent + developer follow-up tracker (Jon 2026-10-20) =====
// Stored on CrmOpportunity.formData.__dispoBuyers (no migration). This is dispo's
// own follow-up "pipeline" for the buyers/agents they've sent an uncontracted deal
// to — so they always know which buyer attaches to which deal and what's due next.
const PT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const ymdAdd = (days: number) => new Date(Date.now() + days * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

// 🧹 Clean up the old auto "Buyer/agent notes" block out of a lead's pinned note
// (Jon 2026-10-21: "it looks ugly, remove it"). We no longer roll notes into the
// pinned note — each agent note goes to the TIMELINE instead — so this just strips
// any leftover block from this lead when its tracker is next touched.
async function cleanPinnedAgentBlock(oppId: string): Promise<void> {
  const { AGENT_NOTES_MARK } = await import("@/lib/crm-shared");
  const o = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { contactId: true, contact: { select: { pinnedNote: true } } } });
  if (!o?.contactId) return;
  const cur = o.contact?.pinnedNote ?? "";
  if (!cur.includes(AGENT_NOTES_MARK)) return;
  await db.crmContact.update({ where: { id: o.contactId }, data: { pinnedNote: cur.split(AGENT_NOTES_MARK)[0].trimEnd() } });
}

async function mutateDispoBuyers(oppId: string, fn: (list: Record<string, unknown>[]) => Record<string, unknown>[]) {
  const o = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true, contactId: true } });
  if (!o) return null;
  const fd = (o.formData ?? {}) as Record<string, unknown>;
  const cur = Array.isArray(fd.__dispoBuyers) ? (fd.__dispoBuyers as Record<string, unknown>[]) : [];
  const next = fn([...cur]);
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __dispoBuyers: next } as never } });
  return o;
}

/** Add a buyer agent / developer we're working this deal. */
export async function addDispoBuyerAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!oppId || !name) return;
  const kind = String(formData.get("kind") ?? "developer") === "buyer_agent" ? "buyer_agent" : "developer";
  const entry: Record<string, unknown> = {
    id: `db_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name, kind,
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim() || undefined,
    price: String(formData.get("price") ?? "").trim() || undefined,
    buyerId: String(formData.get("buyerId") ?? "").trim() || undefined,
    stage: "to_contact", addedAt: PT_TODAY(), nextFollowUp: ymdAdd(1),
  };
  const o = await mutateDispoBuyers(oppId, (list) => { if (list.some((r) => String(r.name).toLowerCase() === name.toLowerCase())) return list; return [...list, entry]; });
  if (o?.contactId) await logCrmEvent({ contactId: o.contactId, oppId, kind: "system", body: `📇 Added ${kind === "buyer_agent" ? "buyer agent" : "developer"} to the follow-up tracker: ${name}`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** Update one field on a tracked buyer (stage / price / nextFollowUp / notes). */
export async function updateDispoBuyerAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  if (!oppId || !entryId || !["stage", "price", "nextFollowUp", "notes", "phone", "email"].includes(field)) return;
  let entryName = "";
  let entryBuyerId = "";
  const o = await mutateDispoBuyers(oppId, (list) => list.map((r) => { if (r.id === entryId) { entryName = String(r.name ?? ""); entryBuyerId = String(r.buyerId ?? ""); } return r.id === entryId ? { ...r, [field]: value || undefined } : r; }));
  // a saved note = working that agent → log it to the TIMELINE as a tracked highlight
  // (not crammed into the pinned note). Buyer Conversations stays a MANUAL KPI (Jon
  // 2026-10-21: auto-counting notes inflated it — 53 vs the real 7).
  if (field === "notes") {
    await cleanPinnedAgentBlock(oppId); // strip any old auto block left in the pinned note
    if (value && o?.contactId) await logCrmEvent({ contactId: o.contactId, oppId, kind: "note", body: `📝 ${entryName || "Agent"}: ${value.slice(0, 500)}`, actor: me.name });
    // 🔁 Mirror the note onto the AGENT'S OWN contact card (Jon 2026-10-24): a note
    // about what this agent wants (e.g. "just send the address, not the whole file")
    // belongs on THEIR lead, not only on the deal. Tagged with the deal it came from.
    if (value && entryBuyerId) {
      const lead = await db.crmOpportunity.findUnique({ where: { id: entryBuyerId }, select: { contactId: true } }).catch(() => null);
      const dealLabel = (await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { title: true, contact: { select: { address: true } } } }).catch(() => null));
      const dealAddr = dealLabel?.contact?.address || dealLabel?.title || "a deal";
      if (lead?.contactId) await logCrmEvent({ contactId: lead.contactId, oppId: entryBuyerId, kind: "note", body: `📝 From deal “${dealAddr}”: ${value.slice(0, 500)}`, actor: me.name });
    }
  }
  revalidatePath(`/crm/${oppId}`);
  if (field === "notes" && entryBuyerId) revalidatePath(`/crm/${entryBuyerId}`);
}

/** Log a touch: stamp last contact today, advance to "contacted", bump next follow-up. */
export async function logDispoBuyerTouchAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  if (!oppId || !entryId) return;
  const result = String(formData.get("result") ?? "").trim(); // what happened on the touch
  let touchedName = "";
  const o = await mutateDispoBuyers(oppId, (list) => list.map((r) => {
    if (r.id !== entryId) return r;
    touchedName = String(r.name);
    const stage = r.stage === "to_contact" ? "contacted" : r.stage === "contacted" ? "following_up" : r.stage;
    return { ...r, lastContact: PT_TODAY(), nextFollowUp: ymdAdd(3), ...(result ? { notes: [r.notes, `${PT_TODAY()}: ${result}`].filter(Boolean).join("\n").slice(0, 2000) } : {}), stage };
  }));
  // 🎙 Show WHO followed up + the RESULT (Jon 2026-10-26: "show the agent that called and the
  // result, not just next touch"). The rep is the actor; the outcome goes right in the line.
  if (o?.contactId && touchedName) {
    const rep = me.name.split(" ")[0];
    await logCrmEvent({ contactId: o.contactId, oppId, kind: "call", body: `📞 ${rep} followed up with ${touchedName}${result ? ` — ${result}` : ""} · next touch ${ymdAdd(3)}`, actor: me.name });
  }
  revalidatePath(`/crm/${oppId}`);
}

/** Remove a tracked buyer from this deal. */
export async function removeDispoBuyerAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  if (!oppId || !entryId) return;
  await mutateDispoBuyers(oppId, (list) => list.filter((r) => r.id !== entryId));
  revalidatePath(`/crm/${oppId}`);
}

// ── 💰 Offers-received tracker (Jon 2026-10-22) ──────────────────────────────
// Stored on CrmOpportunity.formData.__dispoOffers (no migration). Records the
// offers that come BACK on a deal — price, terms, days to close — so we can hold
// the "minimum 3 offers" goal accountable and pick the best one.
async function mutateDispoOffers(oppId: string, fn: (list: Record<string, unknown>[]) => Record<string, unknown>[]) {
  const o = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true, contactId: true } });
  if (!o) return null;
  const fd = (o.formData ?? {}) as Record<string, unknown>;
  const cur = Array.isArray(fd.__dispoOffers) ? (fd.__dispoOffers as Record<string, unknown>[]) : [];
  const next = fn([...cur]);
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __dispoOffers: next } as never } });
  return o;
}

/** Log an offer we received on this deal. */
export async function addDispoOfferAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const buyer = String(formData.get("buyer") ?? "").trim();
  const price = String(formData.get("price") ?? "").trim();
  if (!oppId || !buyer) return;
  const entry: Record<string, unknown> = {
    id: `of_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    buyer, price,
    buyerId: String(formData.get("buyerId") ?? "").trim() || undefined,
    terms: String(formData.get("terms") ?? "").trim() || undefined,
    daysToClose: String(formData.get("daysToClose") ?? "").trim() || undefined,
    status: "received", at: PT_TODAY(), by: me.name,
  };
  const o = await mutateDispoOffers(oppId, (list) => [...list, entry]);
  if (o?.contactId) await logCrmEvent({ contactId: o.contactId, oppId, kind: "system", body: `💰 Offer logged — ${buyer}${price ? ` @ ${price}` : ""}${entry.terms ? ` (${entry.terms})` : ""}${entry.daysToClose ? `, ${entry.daysToClose}d to close` : ""}`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** Update one field on a logged offer (price / terms / daysToClose / status / notes / buyer). */
export async function updateDispoOfferAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  if (!oppId || !entryId || !["price", "terms", "daysToClose", "status", "notes", "buyer"].includes(field)) return;
  await mutateDispoOffers(oppId, (list) => list.map((r) => (r.id === entryId ? { ...r, [field]: value || undefined } : r)));
  revalidatePath(`/crm/${oppId}`);
}

/** Remove a logged offer from this deal. */
export async function removeDispoOfferAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  if (!oppId || !entryId) return;
  await mutateDispoOffers(oppId, (list) => list.filter((r) => r.id !== entryId));
  revalidatePath(`/crm/${oppId}`);
}

/** 🤝 Hand the best buyer offer back to the seller side: record the suggested
 *  seller offer (best buyer offer − our spread), and create a task for the lead's
 *  owner to present it — so dispo's offers turn into a seller counter, fast
 *  (Jon 2026-10-24). */
export async function handBestOfferToSellerAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const n = (k: string) => { const s = String(formData.get(k) ?? "").replace(/[$,\s]/g, ""); return s ? Number(s) || 0 : 0; };
  const best = n("best"), sellerOffer = n("sellerOffer"), spread = best - sellerOffer;
  const buyer = String(formData.get("buyer") ?? "").trim();
  if (!oppId || !best || !sellerOffer) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { contactId: true, assignedTo: true, contact: { select: { name: true, address: true } } } });
  if (!opp) return;
  const addr = opp.contact?.address || opp.contact?.name || "the deal";
  const roi = sellerOffer > 0 ? Math.round((spread / sellerOffer) * 100) : 0;
  const money = (x: number) => `$${Math.round(x).toLocaleString()}`;
  const body = `🤝 Best offer handed to seller side: buyer${buyer ? ` ${buyer}` : ""} at ${money(best)} → present ${money(sellerOffer)} to the seller (our spread ${money(spread)}, ${roi}% ROI).`;
  if (opp.contactId) await logCrmEvent({ contactId: opp.contactId, oppId, kind: "system", body, actor: me.name });
  await db.crmTask.create({ data: { oppId, contactId: opp.contactId, title: `🤝 Present ${money(sellerOffer)} to the seller on ${addr} — best buyer offer ${money(best)} (spread ${money(spread)})`, due: PT_TODAY(), assignedTo: opp.assignedTo || me.name, createdBy: "best-offer" } }).catch(() => {});
  revalidatePath(`/crm/${oppId}`);
}

/** 📄 Generate / save the assignment contract draft on a deal (Jon 2026-10-22).
 *  Builds the Assignment of Purchase & Sale Agreement from the deal's own numbers
 *  (seller-contract price + our assignment fee) and stores it on the opp so it
 *  persists. The contract text is rebuilt server-side from the submitted fields so
 *  the client can't inject arbitrary body text. */
export async function saveAssignmentDraftAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  if (!oppId) return;
  const { buildAssignmentContract, money } = await import("@/lib/assignment-contract");
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const num = (k: string) => { const v = Number(s(k).replace(/[$,\s]/g, "")); return Number.isFinite(v) ? v : 0; };
  const inp = {
    assignorEntity: s("assignorEntity") || "Freedom Offers LLC",
    assignorSigner: s("assignorSigner"),
    assigneeName: s("assigneeName"), assigneeEntity: s("assigneeEntity"), assigneeEmail: s("assigneeEmail"),
    propertyAddress: s("propertyAddress"), apn: s("apn"), county: s("county"), state: s("state"), acres: s("acres"),
    purchasePrice: num("purchasePrice"), assignmentFee: num("assignmentFee"), emd: num("emd"),
    closingDays: num("closingDays") || 30, titleCompany: s("titleCompany"),
    effectiveDate: s("effectiveDate") || PT_TODAY(),
  };
  const text = buildAssignmentContract(inp);
  const draft = { ...inp, generatedAt: new Date().toISOString(), generatedBy: me.name, text };
  const o = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true, contactId: true } });
  if (!o) return;
  const fd = (o.formData ?? {}) as Record<string, unknown>;
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __assignmentDraft: draft } as never } });
  if (o.contactId) await logCrmEvent({ contactId: o.contactId, oppId, kind: "system", body: `📄 Assignment contract drafted — assignee ${inp.assigneeName || inp.assigneeEntity || "TBD"}, purchase ${money(inp.purchasePrice)} + fee ${money(inp.assignmentFee)}.`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** 🖊 Send the assignment contract for signature via PandaDoc (Jon picked PandaDoc
 *  + vendor email delivery, 2026-10-22). PandaDoc drafts + emails the assignee from
 *  its own warm IPs (inbox-safe). Gated: needs PANDADOC_DRAFTING=1 (uses credits)
 *  and PANDADOC_TEMPLATE_ASSIGNMENT set. When not ready, it logs exactly what to
 *  flip so nothing fails silently. Also stashes a share link to text via Telnyx. */
export async function sendAssignmentForSignatureAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  if (!oppId) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true, contactId: true, title: true } });
  if (!opp) return;
  const { readAssignmentDraft, money } = await import("@/lib/assignment-contract");
  const draft = readAssignmentDraft(opp.formData);
  if (!draft) { if (opp.contactId) await logCrmEvent({ contactId: opp.contactId, oppId, kind: "system", body: `🖊 Send-for-signature stopped — generate the assignment contract first.`, actor: me.name }); revalidatePath(`/crm/${oppId}`); return; }
  const { PANDADOC_DRAFTING_ENABLED, assignmentTemplateId, createAssignmentDoc, sendDocument, createShareLink } = await import("@/lib/pandadoc");
  if (!PANDADOC_DRAFTING_ENABLED || !assignmentTemplateId()) {
    const need = [!PANDADOC_DRAFTING_ENABLED ? "set PANDADOC_DRAFTING=1 (uses PandaDoc credits)" : "", !assignmentTemplateId() ? "set PANDADOC_TEMPLATE_ASSIGNMENT to your PandaDoc assignment template id" : ""].filter(Boolean).join(" and ");
    if (opp.contactId) await logCrmEvent({ contactId: opp.contactId, oppId, kind: "system", body: `🖊 PandaDoc send not enabled yet — ${need}. (Until then: create the doc in PandaDoc and text the signing link below.)`, actor: me.name });
    revalidatePath(`/crm/${oppId}`); return;
  }
  const tokens: Record<string, string> = {
    "Property.Address": draft.propertyAddress, "APN": draft.apn,
    "Purchase.Price": money(draft.purchasePrice), "Assignment.Fee": money(draft.assignmentFee),
    "Assignee.Name": draft.assigneeName, "Assignor.Name": draft.assignorEntity,
  };
  const doc = await createAssignmentDoc({ name: `Assignment — ${draft.propertyAddress || opp.title}`, assigneeEmail: draft.assigneeEmail, assigneeName: draft.assigneeName, tokens, metadata: { oppId } });
  if (doc.error || !doc.id) { if (opp.contactId) await logCrmEvent({ contactId: opp.contactId, oppId, kind: "system", body: `🖊 PandaDoc draft failed — ${doc.error ?? "no id"}`, actor: me.name }); revalidatePath(`/crm/${oppId}`); return; }
  const sent = await sendDocument(doc.id, { subject: `Assignment contract — ${draft.propertyAddress}`, message: `Hi ${draft.assigneeName || "there"}, here's the assignment contract for ${draft.propertyAddress}. Review & sign at your convenience — reply with any questions.` });
  let shareLink = "";
  if (draft.assigneeEmail) { const sl = await createShareLink(doc.id, draft.assigneeEmail); shareLink = sl.url ?? ""; }
  const fd = (opp.formData ?? {}) as Record<string, unknown>;
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __assignmentDraft: { ...draft, pandadocId: doc.id, shareLink, sentAt: new Date().toISOString() } } as never } });
  if (opp.contactId) await logCrmEvent({ contactId: opp.contactId, oppId, kind: "system", body: sent.ok ? `🖊 Assignment contract sent for signature via PandaDoc to ${draft.assigneeName || draft.assigneeEmail || "the buyer"}.${shareLink ? ` Signing link ready to text.` : ""}` : `🖊 PandaDoc send failed — ${sent.error}`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** 📲 Text a signing link to the assignee via Telnyx (Jon picked SMS delivery,
 *  2026-10-22). Works today with any signing URL — paste one from PandaDoc's UI
 *  (no API credits needed) or use the link the send action stashed. Routes through
 *  the same quiet-hours / DND / live-line SMS pipeline the composer uses. */
export async function textSigningLinkAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  const link = String(formData.get("link") ?? "").trim();
  if (!oppId || !phone || !/^https?:\/\//i.test(link)) return;
  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { contactId: true, title: true } });
  const name = String(formData.get("name") ?? "").trim().split(/\s+/)[0] || "there";
  const text = `Hi ${name}, here's the contract for ${opp?.title || "the property"} to review & sign: ${link} — reply with any questions. (Freedom Offers)`;
  const d10 = phone.replace(/\D/g, "").slice(-10);
  const toE164 = phone.trim().startsWith("+") ? phone.replace(/[^+\d]/g, "") : d10.length === 10 ? `+1${d10}` : phone;
  const sms = new FormData();
  sms.set("oppId", oppId);
  if (opp?.contactId) sms.set("contactId", opp.contactId);
  sms.set("to", toE164);
  sms.set("text", text);
  await sendCrmSmsAction(sms);
  revalidatePath(`/crm/${oppId}`);
}

/** 🔗 Attach a Buyer-Network lead (developer / buyer agent CrmOpportunity) to a
 *  DEAL (Jon 2026-10-20) — the integration: the deal's follow-up tracker now
 *  points at the real network lead (buyerId = its opp id), and the network lead
 *  gets a timeline note showing which deal it's on. */
export async function attachNetworkBuyerToDeal(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");          // the deal
  const networkOppId = String(formData.get("networkOppId") ?? ""); // the buyer/agent lead
  if (!oppId || !networkOppId) return;
  const lead = await db.crmOpportunity.findUnique({ where: { id: networkOppId }, select: { pipeline: true, contactId: true, contact: { select: { name: true, phone: true, email: true, pinnedNote: true } } } });
  if (!lead) return;
  const { isAgentNetworkName } = await import("@/lib/dispo-buyers");
  const kind = isAgentNetworkName(lead!.pipeline) ? "buyer_agent" : "developer";
  const name = lead.contact?.name || "buyer";
  let added = false;
  await mutateDispoBuyers(oppId, (list) => {
    if (list.some((r) => r.buyerId === networkOppId)) return list; // already attached
    added = true;
    return [...list, {
      id: `db_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name, kind, phone: lead.contact?.phone || undefined, email: lead.contact?.email || undefined,
      buyerId: networkOppId, stage: "to_contact", addedAt: PT_TODAY(), nextFollowUp: ymdAdd(1),
    }];
  });
  if (added) {
    const deal = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { title: true, contactId: true, contact: { select: { address: true, name: true } } } });
    const dealAddr = deal?.contact?.address || deal?.title || "a deal";
    if (deal?.contactId) await logCrmEvent({ contactId: deal.contactId, oppId, kind: "system", body: `🔗 Attached ${kind === "buyer_agent" ? "buyer agent" : "developer"} ${name} to this deal.`, actor: me.name });
    if (lead.contactId) await logCrmEvent({ contactId: lead.contactId, oppId: networkOppId, kind: "system", body: `🔗 Attached to deal: ${dealAddr}. Working the follow-up from the deal's buyer tracker.`, actor: me.name });
  }
  revalidatePath(`/crm/${oppId}`);
}

/** 🗺 Bulk-attach ONE network buyer/agent to EVERY deal in an area (Jon 2026-10-21):
 *  an agent buying across many parcels + sellers in the same market gets attached to
 *  all of them in one click, instead of opening each deal. Reuses the single-attach
 *  rules (dedupe by buyerId, timeline note on both sides). */
export async function bulkAttachNetworkBuyerToDealsAction(formData: FormData) {
  const me = await crmUser();
  const back = String(formData.get("back") ?? "/dispo?tab=deals&view=areas");
  if (!me) redirect(back);
  const networkOppId = String(formData.get("networkOppId") ?? "");
  const oppIds = String(formData.get("oppIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!networkOppId || oppIds.length === 0) redirect(back);
  const lead = await db.crmOpportunity.findUnique({ where: { id: networkOppId }, select: { pipeline: true, contactId: true, contact: { select: { name: true, phone: true, email: true } } } });
  if (!lead) redirect(back);
  const { isAgentNetworkName } = await import("@/lib/dispo-buyers");
  const kind = isAgentNetworkName(lead!.pipeline) ? "buyer_agent" : "developer";
  const name = lead!.contact?.name || "buyer";
  let attached = 0;
  for (const oppId of oppIds) {
    let added = false;
    const o = await mutateDispoBuyers(oppId, (list) => {
      if (list.some((r) => r.buyerId === networkOppId)) return list; // already on this deal
      added = true;
      return [...list, { id: `db_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, kind, phone: lead!.contact?.phone || undefined, email: lead!.contact?.email || undefined, buyerId: networkOppId, stage: "to_contact", addedAt: PT_TODAY(), nextFollowUp: ymdAdd(1) }];
    });
    if (added) {
      attached++;
      if (o?.contactId) await logCrmEvent({ contactId: o.contactId, oppId, kind: "system", body: `🔗 Attached ${kind === "buyer_agent" ? "buyer agent" : "developer"} ${name} to this deal (area bulk-attach).`, actor: me.name });
    }
  }
  if (attached && lead!.contactId) await logCrmEvent({ contactId: lead!.contactId, oppId: networkOppId, kind: "system", body: `🔗 Bulk-attached to ${attached} deal${attached === 1 ? "" : "s"} in one area.`, actor: me.name });
  revalidatePath("/dispo");
  redirect(`${back}${back.includes("?") ? "&" : "?"}bulk=${attached}`);
}

/** 📦 Save the structured parcel list on a land deal (Jon 2026-10-21): one deal,
 *  many parcels — captured cleanly instead of cramming the address field. The first
 *  parcel becomes the headline address/APN so cards stay tidy. No schema migration. */
export async function saveLandParcelsAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  if (!oppId) return;
  let parcels: { address?: string; apn?: string }[] = [];
  try { const j = JSON.parse(String(formData.get("parcels") ?? "[]")); if (Array.isArray(j)) parcels = j; } catch { parcels = []; }
  const { normalizeAddress } = await import("@/lib/address");
  const cleaned = parcels
    .map((p) => ({ address: normalizeAddress(String(p.address ?? "").trim()) || String(p.address ?? "").trim(), apn: String(p.apn ?? "").trim() || undefined }))
    .filter((p) => p.address || p.apn)
    .slice(0, 50);
  const o = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { contactId: true, formData: true } });
  if (!o) return;
  const fd = (o.formData ?? {}) as Record<string, unknown>;
  const land = (fd.land ?? {}) as Record<string, unknown>;
  const property = (fd.property ?? {}) as Record<string, unknown>;
  const first = cleaned[0];
  await db.crmOpportunity.update({ where: { id: oppId }, data: {
    formData: { ...fd, land: { ...land, parcels: cleaned }, property: { ...property, apn: first?.apn ?? (property.apn ?? "") } } as never,
    ...(first?.address ? { title: first.address } : {}),
  } });
  if (first?.address && o.contactId) await db.crmContact.update({ where: { id: o.contactId }, data: { address: first.address } }).catch(() => {});
  if (o.contactId) { const { logEditCoalesced } = await import("@/lib/edit-log"); await logEditCoalesced({ contactId: o.contactId, oppId, body: `📦 Parcels updated — ${cleaned.length} parcel${cleaned.length === 1 ? "" : "s"} on this deal`, actor: me.name }); }
  revalidatePath(`/crm/${oppId}`);
}

/** ⚡ Run the cascade in one click (Jon 2026-10-21): auto-attach the top matched
 *  vetted developers + buyer agents to this deal's follow-up tracker, so the rep works
 *  a ready list instead of building one — the fastest path to getting a deal out to
 *  more buyers. Dedupes; never double-attaches. */
export async function runDispoCascadeAction(formData: FormData) {
  const me = await crmUser();
  const oppId = String(formData.get("oppId") ?? "");
  if (!me || !oppId) return;
  const deal = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { contactId: true, title: true, contact: { select: { address: true } } } });
  if (!deal) return;
  const addr = deal.contact?.address || deal.title || "";
  const { getNetworkMatchesForDeal } = await import("@/lib/buyer-match-lead");
  const matches = await getNetworkMatchesForDeal(addr, 8);
  let attached = 0;
  for (const m of matches) {
    let added = false;
    await mutateDispoBuyers(oppId, (list) => {
      if (list.some((r) => r.buyerId === m.oppId)) return list;
      added = true;
      return [...list, { id: `db_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: m.name, kind: m.kind, phone: m.phone || undefined, buyerId: m.oppId, stage: "to_contact", addedAt: PT_TODAY(), nextFollowUp: ymdAdd(1) }];
    });
    if (added) attached++;
  }
  if (deal.contactId) await logCrmEvent({ contactId: deal.contactId, oppId, kind: "system", body: attached ? `📣 Cascade armed — attached ${attached} matched buyer${attached === 1 ? "" : "s"} (developers + agents) to the tracker. Call, text, and email them now.` : `📣 Cascade run — no new matched buyers in this market yet (all already attached, or none vetted for the area).`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** 🚦 Set a dispo deal's TYPE (cash / novation / land) — picks which gate path applies. */
export async function setDispoDealTypeAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!oppId || !["cash", "novation", "land"].includes(type)) return;
  const o = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true, contactId: true } });
  if (!o) return;
  const fd = (o.formData ?? {}) as Record<string, unknown>;
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __dealType: type } as never } });
  if (o.contactId) await logCrmEvent({ contactId: o.contactId, oppId, kind: "system", body: `🚦 Deal type set: ${type === "cash" ? "💵 All cash" : type === "novation" ? "🤝 Novation" : "⛰️ Sell land, then sign"} — gate path applied.`, actor: me.name });
  revalidatePath(`/crm/${oppId}`);
}

/** 🚦 Toggle one gate checkbox on a dispo deal (stored in formData.__gates). */
export async function toggleDispoGateAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const gateKey = String(formData.get("gateKey") ?? "");
  const idx = parseInt(String(formData.get("idx") ?? ""), 10);
  const checked = String(formData.get("checked") ?? "") === "1";
  if (!oppId || !gateKey || !Number.isInteger(idx) || idx < 0 || idx > 20) return;
  const o = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true } });
  if (!o) return;
  const fd = (o.formData ?? {}) as Record<string, unknown>;
  const gates = (fd.__gates && typeof fd.__gates === "object" && !Array.isArray(fd.__gates) ? fd.__gates : {}) as Record<string, boolean[]>;
  const arr = Array.isArray(gates[gateKey]) ? [...gates[gateKey]] : [];
  while (arr.length <= idx) arr.push(false);
  arr[idx] = checked;
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __gates: { ...gates, [gateKey]: arr } } as never } });
  revalidatePath(`/crm/${oppId}`);
}

/** 📣 Toggle a per-deal marketing SOP checklist step (Jon 2026-10-20). */
export async function toggleDispoMarketingAction(formData: FormData) {
  const me = await crmUser();
  if (!me) return;
  const oppId = String(formData.get("oppId") ?? "");
  const step = String(formData.get("step") ?? "");
  if (!oppId || !step) return;
  const o = await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { formData: true } });
  if (!o) return;
  const fd = (o.formData ?? {}) as Record<string, unknown>;
  const cur = Array.isArray(fd.__marketing) ? (fd.__marketing as string[]).filter((x) => typeof x === "string") : [];
  const next = cur.includes(step) ? cur.filter((s) => s !== step) : [...cur, step];
  await db.crmOpportunity.update({ where: { id: oppId }, data: { formData: { ...fd, __marketing: next } as never } });
  revalidatePath(`/crm/${oppId}`);
}
