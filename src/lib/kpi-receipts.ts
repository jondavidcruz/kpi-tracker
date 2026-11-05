import { db } from "./db";

// 🧾 KPI RECEIPTS (Jon 2026-11-03, reworked 2026-11-04) — "trust but verify." The audit shows the
// per-rep 💰 MONEY KPIs for each role (not company-wide financials) and recomputes the TRUE count
// straight from the records behind each, returning the proof (who / when / which card/lead).
//
// How each KPI is derived:
//  • DISPOSITIONS — buyer-network cards + calls + DealSend + logged offers.
//      Buyer Conversations count REAL connects (talked dispositions, filed recordings, answered
//      inbound) deduped per buyer/day — who the rep actually TALKED to, NOT dial attempts.
//  • ACQUISITIONS — fed straight from the Kanban (Jon 2026-11-04): every time the rep moves a
//      seller lead INTO a stage (appointment / offer / contract sent / signed) it's counted and the
//      lead becomes a receipt — a goalpost you can open to see which lead and what happened to it.
//      The three "Signed" types collapse into ONE "Contract Signed" (the deal itself says which
//      type — assignment / novation / creative).
//  • Anything with no records trail → "✍️ manual": the self-reported number is shown, never flagged.

export type Receipt = { label: string; at: string; oppId?: string; detail?: string };
export type KpiProof = {
  key: string;
  name: string;
  emoji: string;
  systemCount: number | null;  // recomputed live from records (the truth); null = no system trail (manual KPI)
  recorded: number | null;     // the stored KPI Entry value (what the scorecard shows)
  enteredBy: string | null;    // "research"/"crm" = auto (trustworthy) · a name = manual entry
  derivable: boolean;          // can we verify this KPI against records at all?
  status: "match" | "over_reported" | "under_credited" | "records_only" | "auto" | "manual";
  receipts: Receipt[];
};

type Spec = { key: string; name: string; emoji: string; derivable: boolean; recordedKeys: string[]; receipts: Receipt[] };

/** Recompute the rep's 💰 money-KPI counts FROM RECORDS over a date range [from,to]
 *  (inclusive, PT), with the proof behind each. A single day = from===to. */
export async function kpiProofsFor(userId: string, from: string, to: string = from): Promise<KpiProof[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, position: true } });
  if (!user) return [];
  const { secondaryPositionOf } = await import("./roles");
  const { getSettings } = await import("./data");
  const { resolveNetworkPipelines } = await import("./dispo-network");
  const { isDispoPipeline } = await import("./dispo-buyers");

  const roles = [user.position, secondaryPositionOf(user)].filter(Boolean) as string[];
  const isDispo = roles.includes("dispositions");
  const isAcq = roles.includes("acquisitions");
  const isCc = roles.includes("cc_lm");
  if (!isDispo && !isAcq && !isCc) return [];

  const tz = (await getSettings()).orgTimezone || "America/Los_Angeles";
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const inRange = (ymd: string) => ymd >= from && ymd <= to;
  // Query lower bound: start of `from` minus a 14h TZ buffer so nothing on the first day is missed.
  const since = new Date(Date.parse(from + "T00:00:00Z") - 14 * 3600 * 1000);
  const fmtAt = (iso: string | Date) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) + " PT";

  // This rep's stage-moves + calls across the range (used by both dispo + acq derivations).
  const myEvents = await db.crmEvent.findMany({
    where: { actor: user.name, at: { gte: since }, kind: { in: ["stage", "call"] } },
    select: { kind: true, body: true, at: true, contactId: true, oppId: true },
  }).catch(() => [] as { kind: string; body: string; at: Date; contactId: string | null; oppId: string | null }[]);

  const specs: Spec[] = [];

  // ─────────────────────────── DISPOSITIONS ───────────────────────────
  if (isDispo) {
    const net = await resolveNetworkPipelines();
    const netOpps = net.all.length
      ? await db.crmOpportunity.findMany({ where: { pipeline: { in: net.all } }, select: { id: true, title: true, assignedTo: true, createdAt: true, formData: true } })
      : [];
    const titleOf = new Map(netOpps.map((o) => [o.id, o.title]));
    const netIds = new Set(netOpps.map((o) => o.id));

    // 💬 Buyer Conversations = REAL connects (talked / filed recording / answered), deduped per buyer/day.
    const isConnect = (b: string) => {
      const s = b.toLowerCase();
      if (/no answer|voicemail|missed|not filed|click-to-call started|removed —|left voicemail/.test(s)) return false;
      return /talked|good convo|🎙|answered a call|· \d+m \d+s/.test(s) || /answered/.test(s);
    };
    const convoSeen = new Set<string>();
    const convoReceipts: Receipt[] = [];
    for (const e of myEvents) {
      if (e.kind !== "call" || !inRange(dayOf(e.at)) || !isConnect(e.body)) continue;
      const dedup = `${e.contactId || e.oppId || e.body}|${dayOf(e.at)}`;
      if (convoSeen.has(dedup)) continue;
      convoSeen.add(dedup);
      convoReceipts.push({ label: (e.oppId && titleOf.get(e.oppId)) || "(buyer)", at: fmtAt(e.at), oppId: e.oppId || undefined, detail: "talked — real conversation" });
    }

    // ✅ Buyers Vetted = vetting stage-moves (→ vetted/active) on network cards.
    const vettedReceipts: Receipt[] = [];
    for (const e of myEvents) {
      if (e.kind !== "stage" || !inRange(dayOf(e.at)) || !e.oppId || !netIds.has(e.oppId)) continue;
      if (/→\s*(vetted|active)\b/i.test(e.body)) vettedReceipts.push({ label: titleOf.get(e.oppId) || "(card)", at: fmtAt(e.at), oppId: e.oppId, detail: e.body.replace(/.*→\s*/, "→ ") });
    }

    // ➕ New Buyers Added = network cards this rep created in range.
    const addedReceipts: Receipt[] = netOpps
      .filter((o) => o.assignedTo === user.name && o.createdAt >= since && inRange(dayOf(o.createdAt)))
      .map((o) => ({ label: o.title || "(untitled card)", at: fmtAt(o.createdAt), oppId: o.id, detail: "created" }));

    // 📦 Buy-Boxes Captured (MarketContact) in range.
    const boxes = await db.marketContact.findMany({ where: { boxById: userId, boxOn: { gte: from, lte: to } }, select: { name: true, company: true, boxOn: true } }).catch(() => [] as { name: string | null; company: string | null; boxOn: string | null }[]);
    const boxReceipts: Receipt[] = boxes.map((b) => ({ label: b.company || b.name || "(buyer)", at: b.boxOn || from, detail: "buy-box captured" }));

    // 📤 Deals Sent to Buyers = DealSend rows this rep sent in range.
    const sends = await db.dealSend.findMany({ where: { actor: user.name, sentAt: { gte: since } }, select: { sentAt: true, channel: true, buyer: { select: { name: true, company: true } } } }).catch(() => [] as { sentAt: Date; channel: string; buyer: { name: string | null; company: string | null } | null }[]);
    const sentReceipts: Receipt[] = sends.filter((s) => inRange(dayOf(s.sentAt))).map((s) => ({ label: s.buyer?.company || s.buyer?.name || "(buyer)", at: fmtAt(s.sentAt), detail: `sent · ${s.channel}` }));

    // 📥 Buyer Offers Received = offers logged by this rep (per-deal __dispoOffers) in range.
    const offerReceipts: Receipt[] = [];
    for (const o of netOpps) {
      const fd = (o.formData as Record<string, unknown> | null) ?? {};
      const list = Array.isArray(fd.__dispoOffers) ? (fd.__dispoOffers as Record<string, unknown>[]) : [];
      for (const off of list) {
        if (String(off.by ?? "") !== user.name) continue;
        const at = String(off.at ?? "");
        if (!at || !inRange(at)) continue;
        offerReceipts.push({ label: String(off.buyer || "(buyer)"), at, oppId: o.id, detail: `offer ${String(off.price || "")}`.trim() });
      }
    }

    specs.push(
      { key: "dev_conversations", name: "Buyer Conversations", emoji: "💬", derivable: true, recordedKeys: ["dev_conversations"], receipts: convoReceipts },
      { key: "new_buyers", name: "New Buyers Added", emoji: "➕", derivable: true, recordedKeys: ["new_buyers"], receipts: addedReceipts },
      { key: "buyers_vetted", name: "Buyers Vetted", emoji: "✅", derivable: true, recordedKeys: ["buyers_vetted"], receipts: vettedReceipts },
      { key: "buy_boxes_captured", name: "Buy-Boxes Captured", emoji: "📦", derivable: true, recordedKeys: ["buy_boxes_captured"], receipts: boxReceipts },
      { key: "deals_sold", name: "Deals Sent to Buyers", emoji: "📤", derivable: true, recordedKeys: ["deals_sold"], receipts: sentReceipts },
      { key: "buyer_offers_received", name: "Buyer Offers Received", emoji: "📥", derivable: true, recordedKeys: ["buyer_offers_received"], receipts: offerReceipts },
      { key: "contracts_assigned", name: "Contracts Assigned", emoji: "🏁", derivable: false, recordedKeys: ["contracts_assigned"], receipts: [] },
    );
  }

  // ─────────────────────────── ACQUISITIONS (fed from the Kanban) ───────────────────────────
  if (isAcq) {
    // The seller leads this rep moved = opps behind their stage-events that aren't dispo pipelines.
    const stageOppIds = [...new Set(myEvents.filter((e) => e.kind === "stage" && e.oppId).map((e) => e.oppId as string))];
    const stageOpps = stageOppIds.length ? await db.crmOpportunity.findMany({ where: { id: { in: stageOppIds } }, select: { id: true, title: true, pipeline: true } }) : [];
    const acqTitle = new Map<string, string>();
    for (const o of stageOpps) if (!isDispoPipeline(o.pipeline)) acqTitle.set(o.id, o.title);

    // Count a lead ONCE per stage per range (entering the stage = the goalpost). The receipt shows
    // the exact target stage so the mapping is transparent and tunable.
    const stageReceipts = (match: RegExp, exclude?: RegExp): Receipt[] => {
      const seen = new Set<string>();
      const out: Receipt[] = [];
      for (const e of myEvents) {
        if (e.kind !== "stage" || !e.oppId || !acqTitle.has(e.oppId) || !inRange(dayOf(e.at))) continue;
        if (e.body.startsWith("📂")) continue; // a pipeline move, not a stage move
        const target = (e.body.split("→").pop() ?? "").trim();
        if (!match.test(target) || (exclude && exclude.test(target))) continue;
        if (seen.has(e.oppId)) continue;
        seen.add(e.oppId);
        out.push({ label: acqTitle.get(e.oppId) || "(lead)", at: fmtAt(e.at), oppId: e.oppId, detail: `moved → ${target}` });
      }
      return out;
    };

    specs.push(
      { key: "appts_taken", name: "Appointments Attended", emoji: "🤝", derivable: true, recordedKeys: ["appts_taken"], receipts: stageReceipts(/appointment|appt|attend|\bmet\b/i) },
      { key: "offers_made", name: "Offers Made", emoji: "💬", derivable: true, recordedKeys: ["offers_made"], receipts: stageReceipts(/offer/i, /reject|decline/i) },
      { key: "acq_contracts_sent", name: "Contract Sent", emoji: "📤", derivable: true, recordedKeys: ["acq_contracts_sent"], receipts: stageReceipts(/contract.*sent|sent.*contract|contract out/i) },
      { key: "contract_signed", name: "Contract Signed", emoji: "🖊️", derivable: true, recordedKeys: ["acq_signed_assignment", "acq_signed_novation", "acq_signed_creative"], receipts: stageReceipts(/signed|under contract|executed|\bwon\b/i) },
    );
  }

  // ─────────────────────────── CALLER / LEAD MANAGER ───────────────────────────
  if (isCc) {
    specs.push(
      { key: "appts_set", name: "Appointments Set", emoji: "📅", derivable: false, recordedKeys: ["appts_set"], receipts: [] },
      { key: "passoffs", name: "Passoffs to Acquisitions", emoji: "🔁", derivable: false, recordedKeys: ["passoffs"], receipts: [] },
      { key: "leads_generated", name: "Leads Generated", emoji: "✅", derivable: false, recordedKeys: ["leads_generated"], receipts: [] },
    );
  }

  if (!specs.length) return [];

  // Recorded KPI Entry values (what the scorecard shows) — SUMMED across the range (and across the
  // collapsed Signed types) — for the mismatch check. Any manually-entered day marks the KPI manual.
  const allKeys = [...new Set(specs.flatMap((s) => s.recordedKeys))];
  const kpiCat = await db.kpi.findMany({ where: { key: { in: allKeys } }, select: { id: true, key: true } });
  const idToKey = new Map(kpiCat.map((k) => [k.id, k.key]));
  const entries = await db.entry.findMany({ where: { kpiId: { in: kpiCat.map((k) => k.id) }, userId, date: { gte: from, lte: to } }, select: { kpiId: true, value: true, enteredBy: true } });
  const recForKeys = (keys: string[]) => {
    const es = entries.filter((e) => keys.includes(idToKey.get(e.kpiId) ?? ""));
    if (!es.length) return null;
    const value = es.reduce((s, e) => s + (e.value ?? 0), 0);
    const manual = es.find((e) => e.enteredBy && !["research", "crm"].includes(e.enteredBy));
    return { value, enteredBy: manual?.enteredBy ?? es[0].enteredBy };
  };

  return specs.map((sp): KpiProof => {
    const rec = recForKeys(sp.recordedKeys);
    const recorded = rec?.value ?? null;
    const enteredBy = rec?.enteredBy ?? null;
    if (!sp.derivable) return { key: sp.key, name: sp.name, emoji: sp.emoji, systemCount: null, recorded, enteredBy, derivable: false, status: "manual", receipts: [] };
    const systemCount = sp.receipts.length;
    let status: KpiProof["status"];
    if (enteredBy === "research" || enteredBy === "crm" || enteredBy === null) status = recorded == null ? "records_only" : "auto";
    else if (recorded != null && recorded > systemCount) status = "over_reported";
    else if (recorded != null && recorded < systemCount) status = "under_credited";
    else status = "match";
    return { key: sp.key, name: sp.name, emoji: sp.emoji, systemCount, recorded, enteredBy, derivable: true, status, receipts: sp.receipts };
  });
}
