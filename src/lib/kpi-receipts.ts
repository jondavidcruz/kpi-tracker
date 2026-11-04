import { db } from "./db";

// 🧾 KPI RECEIPTS (Jon 2026-11-03) — "trust but verify." For an auto-trackable output KPI,
// recompute the TRUE count straight from the underlying records and return the actual
// records behind it (who / when / which card), so a claimed number can be checked against
// the evidence. Mirrors the derivation in research-kpis.ts, but returns the proof, not just
// a number. Also compares the recorded KPI Entry value vs the system count → mismatch flag.

export type Receipt = { label: string; at: string; oppId?: string; detail?: string };
export type KpiProof = {
  key: string;
  name: string;
  emoji: string;
  systemCount: number;      // recomputed live from records (the truth)
  recorded: number | null;  // the stored KPI Entry value (what the scorecard shows)
  enteredBy: string | null; // "research" = auto (trustworthy) · a name = manual entry
  status: "match" | "over_reported" | "under_credited" | "records_only" | "auto";
  receipts: Receipt[];
};

// The auto-trackable dispo output KPIs (same keys as research-kpis.ts).
const KEY = { added: "new_buyers", box: "buy_boxes_captured", vetted: "buyers_vetted", touched: "developers_contacted" };
const META: Record<string, { name: string; emoji: string }> = {
  [KEY.vetted]: { name: "Developers/Agents Vetted", emoji: "✅" },
  [KEY.added]: { name: "New Buyers Added", emoji: "➕" },
  [KEY.touched]: { name: "Developers Contacted", emoji: "📞" },
  [KEY.box]: { name: "Buy-Boxes Captured", emoji: "📦" },
};

/** Recompute auto-trackable KPI counts for a rep FROM RECORDS over a date range [from,to]
 *  (inclusive, PT), with the proof. A single day = from===to. */
export async function kpiProofsFor(userId: string, from: string, to: string = from): Promise<KpiProof[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return [];
  const { resolveNetworkPipelines } = await import("./dispo-network");
  const { getSettings } = await import("./data");
  const net = await resolveNetworkPipelines();
  const tz = (await getSettings()).orgTimezone || "America/Los_Angeles";
  const dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const inRange = (ymd: string) => ymd >= from && ymd <= to;
  // Query lower bound: start of `from` minus a 14h TZ buffer so nothing on the first day is missed.
  const since = new Date(Date.parse(from + "T00:00:00Z") - 14 * 3600 * 1000);

  // Map network opp ids → title, so receipts name the actual developer/agent card.
  const netOpps = net.all.length
    ? await db.crmOpportunity.findMany({ where: { pipeline: { in: net.all } }, select: { id: true, title: true, assignedTo: true, createdAt: true } })
    : [];
  const titleOf = new Map(netOpps.map((o) => [o.id, o.title]));
  const netIds = new Set(netOpps.map((o) => o.id));
  const fmtAt = (iso: string | Date) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) + " PT";

  // ── new buyers = network cards this rep created in the range ──
  const addedReceipts: Receipt[] = netOpps
    .filter((o) => o.assignedTo === user.name && o.createdAt >= since && inRange(dayOf(o.createdAt)))
    .map((o) => ({ label: o.title || "(untitled card)", at: fmtAt(o.createdAt), oppId: o.id, detail: "created" }));

  // ── vetted + contacted = this rep's events on network cards in the range ──
  const myEvents = await db.crmEvent.findMany({
    where: { actor: user.name, at: { gte: since }, kind: { in: ["stage", "call", "sms", "email"] } },
    select: { kind: true, body: true, at: true, contactId: true, oppId: true },
  }).catch(() => [] as { kind: string; body: string; at: Date; contactId: string | null; oppId: string | null }[]);
  const vettedReceipts: Receipt[] = [];
  const contactedByContact = new Map<string, Receipt>();
  for (const e of myEvents) {
    if (!inRange(dayOf(e.at))) continue;
    if (!e.oppId || !netIds.has(e.oppId)) continue;
    if (e.kind === "stage" && /→\s*(vetted|active)\b/i.test(e.body)) {
      vettedReceipts.push({ label: titleOf.get(e.oppId) || "(card)", at: fmtAt(e.at), oppId: e.oppId, detail: e.body.replace(/.*→\s*/, "→ ") });
    } else if (e.kind !== "stage" && e.contactId) {
      if (!contactedByContact.has(e.contactId)) contactedByContact.set(e.contactId, { label: titleOf.get(e.oppId) || "(card)", at: fmtAt(e.at), oppId: e.oppId, detail: e.kind });
    }
  }

  // ── buy-boxes captured (MarketContact) in the range ──
  const boxes = await db.marketContact.findMany({ where: { boxById: userId, boxOn: { gte: from, lte: to } }, select: { name: true, company: true, boxOn: true } }).catch(() => [] as { name: string | null; company: string | null; boxOn: string | null }[]);
  const boxReceipts: Receipt[] = boxes.map((b) => ({ label: b.company || b.name || "(buyer)", at: b.boxOn || from, detail: "buy-box captured" }));

  // Recorded KPI Entry values (what the scorecard shows) — SUMMED across the range — for the
  // mismatch check. If any day was manually entered, the KPI is treated as manual.
  const kpis = await db.kpi.findMany({ where: { key: { in: Object.values(KEY) } }, select: { id: true, key: true } });
  const entries = await db.entry.findMany({ where: { kpiId: { in: kpis.map((k) => k.id) }, userId, date: { gte: from, lte: to } }, select: { kpiId: true, value: true, enteredBy: true } });
  const recOf = (key: string) => {
    const kpiId = kpis.find((k) => k.key === key)?.id;
    if (!kpiId) return null;
    const es = entries.filter((x) => x.kpiId === kpiId);
    if (!es.length) return null;
    const value = es.reduce((s, e) => s + (e.value ?? 0), 0);
    const manual = es.find((e) => e.enteredBy && !["research", "crm"].includes(e.enteredBy));
    return { value, enteredBy: manual?.enteredBy ?? es[0].enteredBy };
  };

  const build = (key: string, receipts: Receipt[]): KpiProof => {
    const systemCount = receipts.length;
    const rec = recOf(key);
    const recorded = rec?.value ?? null;
    const enteredBy = rec?.enteredBy ?? null;
    let status: KpiProof["status"];
    if (enteredBy === "research" || enteredBy === "crm" || enteredBy === null) status = recorded == null ? "records_only" : "auto";
    else if (recorded != null && recorded > systemCount) status = "over_reported";
    else if (recorded != null && recorded < systemCount) status = "under_credited";
    else status = "match";
    return { key, name: META[key].name, emoji: META[key].emoji, systemCount, recorded, enteredBy, status, receipts };
  };

  return [
    build(KEY.vetted, vettedReceipts),
    build(KEY.added, addedReceipts),
    build(KEY.touched, [...contactedByContact.values()]),
    build(KEY.box, boxReceipts),
  ];
}
