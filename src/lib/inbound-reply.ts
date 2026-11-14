import "server-only";
// 📨 ONE reply-brain for inbound SMS **and** email (Jon 2026-11-11: "if anyone replies via email
// or text from the automations, it'll stop the automation ... and move them out of the pipeline
// they're currently in"). Extracted verbatim from the proven inbound-SMS route so both channels
// classify + route a seller reply identically:
//   • STOP / hostile  → instant DNC
//   • clear "not interested / sold / not owner" → Dead, no follow-up (off the team's list)
//   • working-with-a-realtor → tag + long snooze
//   • qualified / engaged  → forward-only stage move (price → Comp/Offer, else → Follow Up)
//   • ANY reply            → stops the drip sequence + drops a "call them now" task w/ the
//                             discovery checklist (price is the goal; a human sends the offer)
// Forward-only: never pulls a deal backward. Best-effort: never throws into intake.
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

export type ReplyFlags = { wasDnced: boolean; declined: boolean; realtor: boolean; qualified: boolean };

type ReplyContact = { id: string; name: string; assignedTo?: string | null; tags?: string | null };
type ReplyOpp = { id: string; pipeline: string | null; stage: string; tags: string } | null;

// 🎯 What the team is trying to learn on every live seller reply (Jon 2026-11-11). Dropped onto the
// "call them now" task so whoever picks it up knows exactly what to get — the main goal is their
// PRICE, then a human (never an auto-message) sends the offer.
export const SELLER_DISCOVERY_CHECKLIST =
  "🎯 Goal: get their PRICE, then a human sends the offer.\n" +
  "Ask on the call/reply:\n" +
  "• Are they still looking to sell?\n" +
  "• How much do they want? (the #1 thing to get)\n" +
  "• Do they own other land they'd sell too?\n" +
  "• Best email to send the agreement to?\n" +
  "• Utilities on the land + any easements?\n" +
  "• Any other offers or prices they've already been given?";

// ⚖️ Info-fishing / litigation watch (Jon 2026-11-11): a reply probing for our COMPANY or LEGAL
// identity — who we are, LLC/registered agent, address, licensing, how we got their number, or an
// outright legal threat. People sometimes fish for our info to build a TCPA/consumer case. Flagged
// loudly, and louder still when it's NOT an offer/contract lead (no reason to be asking yet).
const LEGAL_REGEX = /\b(who\s*(are\s*you|is\s*this|do\s*you\s*(work|represent)\s*for|owns?\s*(this|the))|wh(at|ich)\s+(llc|company|business|corporation|entity)\b|what('?s|\s*is)?\s*(your|the)\s*(company|business|llc|l\.l\.c|corporation|website|address|legal\s*name|full\s*name)|company\s*name|business\s*(name|license|address)|registered\s*agent|(real\s*estate|broker'?s?)\s*licen[sc]e|are\s*you\s*licen[sc]ed|licen[sc]ed\s*(agent|broker|realtor)|your\s*(llc|ein|tax\s*id|license\s*number)|attorney|lawyer|law\s*suit|lawsuit|litigat|prosecut|\bsu(e|ed|ing)\b|legal\s*action|take\s*legal|cease\s*(and\s*desist|all\s*|any\s*)?(contact|communicat)|cease\s*and\s*desist|\btcpa\b|do\s*not\s*(call|contact|text|message)|dnc\s*(list|registry)|consumer\s*(protection|information|privacy)|data\s*protection\s*act|violat(e|ing|ion)|\breported?\b.*\b(you|company|against)|report\s*(will\s*be\s*)?(filed|you)|filed?\s*(against|a\s*(report|complaint))|attorney\s*general|\bftc\b|\bfcc\b|file\s*a\s*(complaint|report)|\bdamages\b|statutory|how\s*did\s*you\s*get\s*my|remove\s*(this|my|me).*(number|list|call)|take\s*me\s*off.*(list|call))\b/i;

/** Classify + route a seller's inbound reply. Returns the intent flags so the caller can decide
 *  whether to push a notification. `contactInfo` is the phone/email shown in the reply task title. */
export async function routeSellerReply(args: {
  channel: "sms" | "email";
  text: string;
  contact: ReplyContact;
  opp: ReplyOpp;
  contactInfo?: string;
}): Promise<ReplyFlags> {
  const { channel, contact, opp } = args;
  const text = String(args.text ?? "").slice(0, 2000);
  let wasDnced = false, declined = false, realtor = false, qualified = false;

  try {
    const { DNC_REGEX, dncContact } = await import("@/lib/crm-dnc");
    const { replyIntentWith } = await import("@/lib/master-workflow");
    const { loadWorkflowConfig } = await import("@/lib/master-workflow-store");
    const wfCfg = await loadWorkflowConfig(); // ⚙️ owner-edited keywords + timings (/admin/workflow)
    // Clear "not interested" → Dead (no follow-up). Catches colloquial phrasings ("don't wanna
    // sell", "won't sell", "not gonna sell", "not looking to sell", "not for sale") so a clear
    // decline isn't missed and wrongly given a 30-day circle-back (Jon 2026-11-11).
    const DECLINE_REGEX = /\b(not\s*(interested|selling|for\s*sale|looking\s*to\s*sell)|no\s*thank|already\s*sold|we\s*sold|don'?t\s*(want|wanna|wish|need|plan|intend|care)\s*(to\s*)?sell|won'?t\s*sell|not\s*(gonna|going\s*to|planning\s*to|looking\s*to|trying\s*to)\s*sell|\bpass\b|take\s*me\s*off|wrong\s*(number|person))\b|^\s*(no|nope)\b[.! ]*$/i;
    const kw = replyIntentWith(text, wfCfg); // 🤖 Master Workflow: realtor / qualified keywords
    if (DNC_REGEX.test(text)) { wasDnced = true; await dncContact(contact.id, `inbound ${channel} matched the STOP/hostile filter: "${text.slice(0, 80)}"`); }
    else if (DECLINE_REGEX.test(text)) { declined = true; }
    else if (kw === "working_with_realtor") { realtor = true; }
    else if (kw === "qualified") { qualified = true; }
    else if (text.length >= 12) {
      // 🤖 AI screen — one call, three buckets.
      try {
        const { aiText } = await import("@/lib/ai");
        const verdict = await aiText({
          maxTokens: 6,
          messages: [{ role: "user", content: `A homeowner replied to a real-estate investor's ${channel === "email" ? "email" : "text"}:\n"""${text.slice(0, 400)}"""\nClassify their intent in ONE word:\nSTOP = demands we stop contacting, hostile/abusive/cussing, or "remove me from the list".\nDECLINE = simply not interested / not selling / already sold, but not hostile.\nREPLY = anything else (a question, interest, price, neutral).\nAnswer with exactly one word: STOP, DECLINE, or REPLY.` }],
        });
        if (/stop/i.test(verdict)) { wasDnced = true; await dncContact(contact.id, `AI screen — seller said stop/hostile: "${text.slice(0, 80)}"`); }
        else if (/decline/i.test(verdict)) { declined = true; }
      } catch { /* screen is best-effort; the rep task still fires */ }
    }

    // ⚖️ Litigator / info-fishing watch — established = we've already sent them an offer/contract
    // (then it's a normal question); otherwise asking for our company/legal info is a red flag.
    const established = opp ? /offer_call|verbal_offer|contract|signed|escrow|closing|won/i.test(opp.stage) : false;
    const legalFlag = LEGAL_REGEX.test(text);

    // 🤖 MASTER WORKFLOW (Jonathan Duong 2026-10-28): auto-tag + auto-SCHEDULE the next follow-up
    // so snoozed leads resurface instead of being lost, and the VA only works qualified ones.
    const { intentTag, followUpDaysWith, followUpDate } = await import("@/lib/master-workflow");
    const applyIntent = async (intent: "not_interested" | "working_with_realtor" | "qualified", moveStage: boolean) => {
      if (!opp) return;
      const days = followUpDaysWith(intent, wfCfg);
      const tag = intentTag(intent);
      const tags = tag && !new RegExp(tag, "i").test(opp.tags || "") ? [opp.tags, tag].filter(Boolean).join(",") : (opp.tags || "");
      let stageData: Record<string, unknown> = {};
      if (moveStage) {
        const { readPipelines } = await import("@/lib/crm");
        const pls = await readPipelines();
        const pl = pls.find((x) => x.name === (opp.pipeline || "War Room")) ?? pls[0];
        const match = (rx: RegExp) => pl?.stages.find((s) => rx.test(`${s.key} ${s.label}`));
        const target = intent === "working_with_realtor"
          ? (match(/nurtur/i) ?? match(/follow.?up/i))
          : (match(/not.?interest|no.?interest/i) ?? match(/\bdead\b|lost/i) ?? match(/nurture/i));
        if (target && target.key !== opp.stage) stageData = { stage: target.key };
      }
      await db.crmOpportunity.update({ where: { id: opp.id }, data: { ...stageData, tags, ...(days > 0 ? { nextFollowUp: followUpDate(days) } : {}) } }).catch(() => {});
      const label = intent === "not_interested" ? "not interested" : intent === "working_with_realtor" ? "working with a realtor" : "qualified — interested";
      await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `🤖 Auto-tagged “${intent === "qualified" ? "qualified ✅" : label}”${days > 0 ? ` · follow-up set ${followUpDate(days)} (${days}d)` : " · surfaced to the team now"}: "${text.slice(0, 60)}"`, actor: "master-workflow" }).catch(() => {});
    };
    // 🪦 CLEAR "not interested / sold / not the owner" → DEAD with NO follow-up so it never
    // resurfaces — the team should only see repliers who ARE interested.
    const applyDead = async (why: string) => {
      if (!opp) return;
      const { readPipelines } = await import("@/lib/crm");
      const pls = await readPipelines();
      const pl = pls.find((x) => x.name === (opp.pipeline || "War Room")) ?? pls[0];
      const dead = pl?.stages.find((s) => /\bdead\b|lost|not.?interest|no.?interest/i.test(`${s.key} ${s.label}`));
      const tag = "not-interested";
      const tags = !new RegExp(tag, "i").test(opp.tags || "") ? [opp.tags, tag].filter(Boolean).join(",") : (opp.tags || "");
      await db.crmOpportunity.update({ where: { id: opp.id }, data: { ...(dead && dead.key !== opp.stage ? { stage: dead.key } : {}), tags, nextFollowUp: "" } }).catch(() => {});
      await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `🪦 Auto-moved to Dead — seller clearly NOT interested (no follow-up, off the team's list): "${why.slice(0, 80)}"`, actor: "master-workflow" }).catch(() => {});
    };
    if (declined && opp) await applyDead(text);
    else if (realtor && opp) await applyIntent("working_with_realtor", true);
    else if (qualified && opp) await applyIntent("qualified", false);

    // 💰/📨 Stage automation: a reply with a PRICE → move to Comp/Offer so the team can check the
    // numbers; any other engaged reply → advance a COLD lead to Follow Up. Forward-only (never pulls
    // a deal back) and skips declined/realtor/DNC replies.
    if (opp && !declined && !realtor && !wasDnced) {
      try {
        const { readPipelines } = await import("@/lib/crm");
        const pls = await readPipelines();
        const pl = pls.find((x) => x.name === (opp.pipeline || "War Room")) ?? pls[0];
        const stages = pl?.stages ?? [];
        const find = (rx: RegExp) => stages.find((s) => rx.test(`${s.key} ${s.label}`));
        const idxOf = (k?: string) => stages.findIndex((s) => s.key === k);
        const priceHit = /\$\s?\d[\d,]{2,}|\b\d{2,3},\d{3}\b|\b\d{2,3}\s?k\b|\basking\b[^.]*\d|\bwant\b[^.]*\$?\d{3,}/i.test(text);
        const comp = find(/comp.*offer|offer.*comp|\bcomp\b/i) ?? find(/\boffer\b/i);
        const followUp = find(/follow.?up/i);
        const curIdx = idxOf(opp.stage);
        if (priceHit && comp && comp.key !== opp.stage && curIdx >= 0 && curIdx < idxOf(comp.key)) {
          await db.crmOpportunity.update({ where: { id: opp.id }, data: { stage: comp.key } }).catch(() => {});
          await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `💰 Auto-moved to ${comp.label} — seller replied with a price: "${text.slice(0, 80)}"`, actor: "master-workflow" }).catch(() => {});
        } else if (followUp && followUp.key !== opp.stage && curIdx >= 0 && curIdx < idxOf(followUp.key)) {
          await db.crmOpportunity.update({ where: { id: opp.id }, data: { stage: followUp.key } }).catch(() => {});
          await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `📨 Auto-moved to ${followUp.label} — seller replied: "${text.slice(0, 80)}"`, actor: "master-workflow" }).catch(() => {});
        }
      } catch { /* best-effort — never breaks intake */ }
    }

    // 📨 Any reply STOPS the drip sequence — they engaged, hand it to a human (text OR email).
    if (opp) { try { const { stopDrip } = await import("@/lib/drip"); await stopDrip(opp.id, `seller replied (${channel})`); } catch { /* ok */ } }

    // 🙈 Keep the Team Inbox clean (Jon 2026-11-12): STOP/DNC, clear "not interested", and
    // working-with-a-realtor replies are auto-marked READ so they never sit in the unread queue —
    // the team should only SEE messages from people who are interested / gave a price. Legal-flagged
    // replies are NOT auto-read (they still need eyes). Qualified/engaged/price replies stay unread.
    if ((wasDnced || declined || realtor) && !legalFlag) {
      try { const { setConvRead } = await import("@/lib/conv-read"); await setConvRead([contact.id], true); } catch { /* best-effort */ }
    }

    // ⚖️ Info-fishing / legal probe → flag HARD, tag the contact, warn the team, and DON'T drop a
    // routine "call them" task (they must verify identity first). Louder when NOT an offer/contract
    // lead. Never auto-DNCs — a human decides. (Jon 2026-11-11: "these people try to get our info to sue us".)
    if (legalFlag && opp) {
      const sev = established ? "ℹ️" : "⚠️";
      if (!/\blegal-watch\b/i.test(contact.tags || "")) {
        await db.crmContact.update({ where: { id: contact.id }, data: { tags: [contact.tags, "legal-watch"].filter(Boolean).join(",") } }).catch(() => {});
      }
      await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: `${sev} LEGAL WATCH — they asked for our company/legal info${established ? "" : " and are NOT an offer/contract lead (higher risk — people sometimes fish for our info to sue us)"}. Verify who they are before sharing anything; never send the company name, address, LLC, or licensing by text/email.`, actor: "legal-watch" }).catch(() => {});
      // ⚖️ An EXPLICIT litigation threat (sue / lawsuit / cease-and-desist / TCPA / attorney /
      // harassment) → auto-opt-out so NO automation ever contacts them again (Jon 2026-11-13).
      // Info-fishing-only questions ("who are you / what LLC") do NOT auto-opt-out — a human decides.
      // dncContact is live-deal-safe (suppresses texting but keeps a real deal workable by a human).
      const { HARD_THREAT_REGEX, threatType } = await import("@/lib/contact-guard");
      const isHardThreat = HARD_THREAT_REGEX.test(text);
      if (!wasDnced && isHardThreat) {
        try { await dncContact(contact.id, `⚖️ litigation threat via ${channel}: "${text.slice(0, 80)}"`); wasDnced = true; } catch { /* best-effort */ }
      }
      // ⚖️ LITIGATOR PROTOCOL — snapshot the FULL record (import source + consent + opt-out status +
      // every message in/out) into the permanent legal-defense file so it can never be lost. Run AFTER
      // the auto-opt-out above so the snapshot records that we suppressed them (Jon 2026-11-12/13).
      try { const { saveLegalWatchRecord } = await import("@/lib/legal-watch"); await saveLegalWatchRecord(contact.id, text, channel, threatType(text)); } catch { /* best-effort */ }
      const ltoday = new Date().toISOString().slice(0, 10);
      const ltitle = `${sev} LEGAL WATCH: ${contact.name.split(" ")[0]} asked for company/legal info — verify before replying`.slice(0, 180);
      const ldup = await db.crmTask.findFirst({ where: { title: ltitle, doneAt: null } }).catch(() => null);
      if (!ldup) {
        const lt = await db.crmTask.create({ data: { contactId: contact.id, oppId: opp.id, title: ltitle, due: ltoday, assignedTo: contact.assignedTo || "", createdBy: "legal-watch" } }).catch(() => null);
        if (lt) { try { const { writeTaskNote } = await import("@/lib/task-notes"); await writeTaskNote(lt.id, `Their message: "${text.slice(0, 400)}"\n\n⚖️ Do NOT share the company name, address, LLC, registered agent, licensing, or any owner details by text or email. ${established ? "This IS an offer/contract lead, so it may be a normal question — still confirm it's really them." : "This is NOT an offer/contract lead — treat as a possible litigator fishing for info. Route to a manager."}`); } catch { /* note best-effort */ } }
      }
      try { const { sendPushTo } = await import("@/lib/push"); sendPushTo(contact.assignedTo ? [contact.assignedTo.split(" ")[0]] : ("all" as const), { title: `${sev} Legal watch`, body: `${contact.name} asked for company/legal info — verify before replying`, url: `/crm/conversations?c=${contact.id}`, tag: `legal-${contact.id}` }).catch(() => {}); } catch { /* push best-effort */ }
    }

    // ✅ Drop ONE "call them now" task carrying the discovery checklist — only for engaged repliers
    // (not DNC / not-interested / realtor / legal-flagged, which are handled above). Deduped by title.
    if (!legalFlag && !wasDnced && !declined && !realtor && contact.assignedTo && !/\bdnc\b|\bdnd_all\b/i.test(contact.tags || "")) {
      const today = new Date().toISOString().slice(0, 10);
      const info = args.contactInfo ? ` (${args.contactInfo})` : "";
      const icon = channel === "email" ? "✉️" : "💬";
      const title = `${qualified ? "✅ QUALIFIED" : icon} ${contact.name.split(" ")[0]} replied by ${channel === "email" ? "email" : "text"} — call them${info}`.slice(0, 180);
      const dup = await db.crmTask.findFirst({ where: { title, doneAt: null } }).catch(() => null);
      if (!dup) {
        const task = await db.crmTask.create({ data: { contactId: contact.id, oppId: opp?.id ?? "", title, due: today, assignedTo: contact.assignedTo, createdBy: `inbound-${channel}` } }).catch(() => null);
        if (task) { try { const { writeTaskNote } = await import("@/lib/task-notes"); await writeTaskNote(task.id, `Their reply: "${text.slice(0, 300)}"\n\n${SELLER_DISCOVERY_CHECKLIST}`); } catch { /* note is best-effort */ } }
      }
    }
  } catch { /* guard never breaks intake */ }

  return { wasDnced, declined, realtor, qualified };
}
