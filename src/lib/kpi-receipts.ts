import { db } from "./db";

// 🧾 KPI RECEIPTS (Jon 2026-11-03, reworked 2026-11-04) — "trust but verify." The audit now
// mirrors the SCORECARD's 💰 Money Movers group (every category:"green" KPI on the rep's card),
// so it can never drift out of sync with what the team actually reports. For each Money Mover we
// recompute the TRUE count straight from the underlying records and return the proof (who / when
// / which card). KPIs we can't derive from records are shown as "✍️ manual" — their self-reported
// number is surfaced but NOT falsely flagged as over-reported.
//
// Jon's rule on conversations (2026-11-04): "Buyer Conversations" must count REAL conversations —
// who the rep actually TALKED to — not dial attempts. We count only connected calls (dialer
// "talked" dispositions + filed recordings + answered inbound), deduped per buyer per day.

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

// Preferred display order for the Money Movers (matches the scorecard). Unknown green KPIs fall
// to the end. Keys are stable slugs from the KPI catalog.
const ORDER = ["dev_conversations", "new_buyers", "buyers_vetted", "buy_boxes_captured", "deals_sold", "buyer_offers_received", "contracts_assigned"];

// Which green KPIs we know how to derive receipts for (everything else → "✍️ manual", shown but
// never flagged). Keep this in sync with the derive() switch below.
const DERIVABLE = new Set(["dev_conversations", "new_buyers", "buyers_vetted", "buy_boxes_captured", "deals_sold", "buyer_offers_received"]);

/** Recompute the rep's 💰 Money-Mover KPI counts FROM RECORDS over a date range [from,to]
 *  (inclusive, PT), with the proof behind each. A single day = from===to. */
export async function kpiProofsFor(userId: string, from: string, to: string = from): Promise<KpiProof[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, position: true } });
  if (!user) return [];
  const { secondaryPositionOf } = await import("./roles");
  const { getSettings } = await import("./data");
  const { resolveNetworkPipelines } = await import("./dispo-network");

  // The Money Movers for THIS rep = every green KPI on their scorecard (their role + team-wide).
  const roles = new Set([user.position, secondaryPositionOf(user)].filter(Boolean) as string[]);
  const greenKpis = (await db.kpi.findMany({
    where: { category: "green" },
    select: { id: true, key: true, name: true, emoji: true, scope: true, roleKey: true },
  })).filter((k) => k.scope === "team" || !k.roleKey || roles.has(k.roleKey));
  if (!greenKpis.length) return [];

  const tz = (await getSettings()).orgTimezone || "America/Los_Angeles";
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const inRange = (ymd: string) => ymd >= from && ymd <= to;
  // Query lower bound: start of `from` minus a 14h TZ buffer so nothing on the first day is missed.
  const since = new Date(Date.parse(from + "T00:00:00Z") - 14 * 3600 * 1000);
  const fmtAt = (iso: string | Date) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) + " PT";

  // Network (buyer/developer) cards — used by several Money Movers.
  const net = await resolveNetworkPipelines();
  const netOpps = net.all.length
    ? await db.crmOpportunity.findMany({ where: { pipeline: { in: net.all } }, select: { id: true, title: true, assignedTo: true, createdAt: true, formData: true } })
    : [];
  const titleOf = new Map(netOpps.map((o) => [o.id, o.title]));
  const netIds = new Set(netOpps.map((o) => o.id));

  // This rep's events on network cards (vetting stage-moves + real conversations).
  const myEvents = await db.crmEvent.findMany({
    where: { actor: user.name, at: { gte: since }, kind: { in: ["stage", "call"] } },
    select: { kind: true, body: true, at: true, contactId: true, oppId: true },
  }).catch(() => [] as { kind: string; body: string; at: Date; contactId: string | null; oppId: string | null }[]);

  // ── 💬 Buyer Conversations = REAL conversations (who the rep actually talked to) ──
  // A call event is a conversation when it reflects a CONNECT: a "talked" dialer disposition,
  // a filed recording (🎙 — kept past the voicemail gate), or an answered inbound. Explicitly
  // NOT: no-answer, voicemail, missed, click-to-call-started, "not filed". Deduped per buyer/day.
  const isConnect = (b: string) => {
    const s = b.toLowerCase();
    if (/no answer|voicemail|missed|not filed|click-to-call started|removed —|left voicemail/.test(s)) return false;
    return /talked|good convo|🎙|answered a call|· \d+m \d+s/.test(s) || /answered/.test(s);
  };
  const convoSeen = new Set<string>();
  const convoReceipts: Receipt[] = [];
  for (const e of myEvents) {
    if (e.kind !== "call") continue;
    const ymd = dayOf(e.at);
    if (!inRange(ymd)) continue;
    if (!isConnect(e.body)) continue;
    const who = e.contactId || e.oppId || e.body;
    const dedup = `${who}|${ymd}`;
    if (convoSeen.has(dedup)) continue;
    convoSeen.add(dedup);
    convoReceipts.push({ label: (e.oppId && titleOf.get(e.oppId)) || "(buyer)", at: fmtAt(e.at), oppId: e.oppId || undefined, detail: "talked — real conversation" });
  }

  // ── ✅ Buyers Vetted = vetting stage-moves (→ vetted/active) on network cards ──
  const vettedReceipts: Receipt[] = [];
  for (const e of myEvents) {
    if (e.kind !== "stage") continue;
    if (!inRange(dayOf(e.at))) continue;
    if (!e.oppId || !netIds.has(e.oppId)) continue;
    if (/→\s*(vetted|active)\b/i.test(e.body)) vettedReceipts.push({ label: titleOf.get(e.oppId) || "(card)", at: fmtAt(e.at), oppId: e.oppId, detail: e.body.replace(/.*→\s*/, "→ ") });
  }

  // ── ➕ New Buyers Added = network cards this rep created in range ──
  const addedReceipts: Receipt[] = netOpps
    .filter((o) => o.assignedTo === user.name && o.createdAt >= since && inRange(dayOf(o.createdAt)))
    .map((o) => ({ label: o.title || "(untitled card)", at: fmtAt(o.createdAt), oppId: o.id, detail: "created" }));

  // ── 📦 Buy-Boxes Captured (MarketContact) in range ──
  const boxes = await db.marketContact.findMany({ where: { boxById: userId, boxOn: { gte: from, lte: to } }, select: { name: true, company: true, boxOn: true } }).catch(() => [] as { name: string | null; company: string | null; boxOn: string | null }[]);
  const boxReceipts: Receipt[] = boxes.map((b) => ({ label: b.company || b.name || "(buyer)", at: b.boxOn || from, detail: "buy-box captured" }));

  // ── 📤 Deals Sent to Buyers = DealSend rows this rep sent in range ──
  const sends = await db.dealSend.findMany({ where: { actor: user.name, sentAt: { gte: since } }, select: { sentAt: true, channel: true, buyer: { select: { name: true, company: true } } } }).catch(() => [] as { sentAt: Date; channel: string; buyer: { name: string | null; company: string | null } | null }[]);
  const sentReceipts: Receipt[] = sends
    .filter((s) => inRange(dayOf(s.sentAt)))
    .map((s) => ({ label: s.buyer?.company || s.buyer?.name || "(buyer)", at: fmtAt(s.sentAt), detail: `sent · ${s.channel}` }));

  // ── 📥 Buyer Offers Received = offers logged by this rep (per-deal __dispoOffers) in range ──
  const offerReceipts: Receipt[] = [];
  for (const o of netOpps) {
    const fd = (o.formData as Record<string, unknown> | null) ?? {};
    const list = Array.isArray(fd.__dispoOffers) ? (fd.__dispoOffers as Record<string, unknown>[]) : [];
    for (const off of list) {
      const by = String(off.by ?? "");
      const at = String(off.at ?? "");
      if (by !== user.name) continue;
      if (!at || !inRange(at)) continue;
      offerReceipts.push({ label: String(off.buyer || "(buyer)"), at, oppId: o.id, detail: `offer ${String(off.price || "")}`.trim() });
    }
  }

  const RECEIPTS: Record<string, Receipt[]> = {
    dev_conversations: convoReceipts,
    buyers_vetted: vettedReceipts,
    new_buyers: addedReceipts,
    buy_boxes_captured: boxReceipts,
    deals_sold: sentReceipts,
    buyer_offers_received: offerReceipts,
  };

  // Recorded KPI Entry values (what the scorecard shows) — SUMMED across the range — for the
  // mismatch check. If any day was manually entered, the KPI is treated as manual.
  const kpiIds = greenKpis.map((k) => k.id);
  const entries = await db.entry.findMany({ where: { kpiId: { in: kpiIds }, userId, date: { gte: from, lte: to } }, select: { kpiId: true, value: true, enteredBy: true } });
  const recOf = (kpiId: string) => {
    const es = entries.filter((x) => x.kpiId === kpiId);
    if (!es.length) return null;
    const value = es.reduce((s, e) => s + (e.value ?? 0), 0);
    const manual = es.find((e) => e.enteredBy && !["research", "crm"].includes(e.enteredBy));
    return { value, enteredBy: manual?.enteredBy ?? es[0].enteredBy };
  };

  const proofs: KpiProof[] = greenKpis.map((k) => {
    const rec = recOf(k.id);
    const recorded = rec?.value ?? null;
    const enteredBy = rec?.enteredBy ?? null;
    const derivable = DERIVABLE.has(k.key);
    if (!derivable) {
      // A green KPI with no system trail (e.g. Contracts Assigned) — show the number, don't flag.
      return { key: k.key, name: k.name, emoji: k.emoji, systemCount: null, recorded, enteredBy, derivable, status: "manual", receipts: [] };
    }
    const receipts = RECEIPTS[k.key] ?? [];
    const systemCount = receipts.length;
    let status: KpiProof["status"];
    if (enteredBy === "research" || enteredBy === "crm" || enteredBy === null) status = recorded == null ? "records_only" : "auto";
    else if (recorded != null && recorded > systemCount) status = "over_reported";
    else if (recorded != null && recorded < systemCount) status = "under_credited";
    else status = "match";
    return { key: k.key, name: k.name, emoji: k.emoji, systemCount, recorded, enteredBy, derivable, status, receipts };
  });

  proofs.sort((a, b) => {
    const ia = ORDER.indexOf(a.key), ib = ORDER.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return proofs;
}
