// 📇 Per-deal buyer-agent + developer follow-up tracker (Jon 2026-10-20).
// Process 1 ("DS: Sell Land Then Sign"): dispo sends an uncontracted deal to
// vetted developers + buyer agents in the area, then CHASES them to learn what
// they'll pay — the biggest hurdle is the follow-up sequence, and there was no
// way to see which buyer attaches to which deal. This stores that list ON the
// deal (CrmOpportunity.formData.__dispoBuyers) so no schema migration is needed.
// Pure + client-safe: types, stages, and read/normalize helpers only.

export type DispoBuyerKind = "developer" | "buyer_agent";
export type DispoBuyerStage = "to_contact" | "contacted" | "following_up" | "offer_in" | "passed";

export type DispoBuyer = {
  id: string;               // entry id (not the MarketContact id)
  name: string;
  kind: DispoBuyerKind;
  phone?: string;
  email?: string;
  stage: DispoBuyerStage;
  lastContact?: string;     // YYYY-MM-DD
  nextFollowUp?: string;    // YYYY-MM-DD — drives the "due" highlight
  price?: string;           // what they said they'd pay
  notes?: string;
  buyerId?: string;         // link back to the network lead opp (developer/agent), if any
  contactId?: string;       // the network lead's CONTACT id — merged at render for call/text/email + note-sync
  addedAt?: string;         // YYYY-MM-DD
};

// The follow-up SEQUENCE (left→right). Moving a card right = progress.
export const DISPO_BUYER_STAGES: { key: DispoBuyerStage; label: string; cls: string; dot: string }[] = [
  { key: "to_contact", label: "To reach out", cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  { key: "contacted", label: "Contacted", cls: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  { key: "following_up", label: "Following up", cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  { key: "offer_in", label: "💵 Price / offer in", cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { key: "passed", label: "✕ Passed", cls: "bg-rose-100 text-rose-600", dot: "bg-rose-400" },
];

export const DISPO_BUYER_KINDS: { key: DispoBuyerKind; label: string; emoji: string }[] = [
  { key: "developer", label: "Developer / cash buyer", emoji: "🏗" },
  { key: "buyer_agent", label: "Buyer agent", emoji: "🧑‍💼" },
];

export function stageMeta(s: string) {
  return DISPO_BUYER_STAGES.find((x) => x.key === s) ?? DISPO_BUYER_STAGES[0];
}

/** Read + normalize the tracker off an opp's formData (never throws). */
export function readDispoBuyers(formData: unknown): DispoBuyer[] {
  const fd = formData as Record<string, unknown> | null;
  const raw = fd?.__dispoBuyers;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      kind: (r.kind === "buyer_agent" ? "buyer_agent" : "developer") as DispoBuyerKind,
      phone: r.phone ? String(r.phone) : undefined,
      email: r.email ? String(r.email) : undefined,
      stage: (DISPO_BUYER_STAGES.some((s) => s.key === r.stage) ? r.stage : "to_contact") as DispoBuyerStage,
      lastContact: r.lastContact ? String(r.lastContact) : undefined,
      nextFollowUp: r.nextFollowUp ? String(r.nextFollowUp) : undefined,
      price: r.price ? String(r.price) : undefined,
      notes: r.notes ? String(r.notes) : undefined,
      buyerId: r.buyerId ? String(r.buyerId) : undefined,
      contactId: r.contactId ? String(r.contactId) : undefined,
      addedAt: r.addedAt ? String(r.addedAt) : undefined,
    }))
    .filter((r) => r.id && r.name);
}

/** Is this a dispositions pipeline (DS: … / dispo)? */
export function isDispoPipeline(name: string | null | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  return /^ds[:\s]/.test(n) || n.includes("sell land") || n.includes("go close") || n.includes("dispo");
}

/** A dispo DEAL pipeline (a property deal) — where the per-deal buyer/agent tracker
 *  + matching-buyers + DEAL WON → Deal generation belong. NOT the buyer-network
 *  pipelines (developers / agents), which are contacts, not deals. */
export function isDispoDealPipeline(name: string | null | undefined): boolean {
  const n = (name ?? "").toLowerCase();
  // land pre-marketing, signed-go-close (novation), signed-off-market (cash)
  return n.includes("sell land") || n.includes("go close") || n.includes("off market") || n.includes("signed");
}

// 🏗 / 🧑‍💼 The two dispo buyer-NETWORK pipelines (developers + buyer agents) —
// real CrmOpportunity pipelines so each lead is a card with notes + stages, like
// the Acquisitions CRM (Jon 2026-10-20). NOTE: these were renamed in the live CRM
// to "DS: Developers" / "DS: Buyer Agents" (Jon's screenshot 2026-10-24). The
// matchers below are tolerant of naming/whitespace variants so classification +
// the seller-CRM exclusion never silently break when a pipeline is renamed.
export const DISPO_DEV_PIPELINE = "DS: Developers";
export const DISPO_AGENT_PIPELINE = "DS: Buyer Agents";

// Normalize + STRIP a leading emoji/symbol run, so "🏗 DS: Developers" → "ds: developers"
// (Jon put emojis on the pipeline names, which broke the old `^ds` anchor — 2026-10-24).
const normPipe = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim().replace(/^[^a-z0-9]+/, "").trim();

/** A buyer-NETWORK developer pipeline — tolerant of "DS: Developers",
 *  "DS: Unvetted Developers", a leading emoji, trailing spaces, etc. */
export function isDevNetworkName(name: string | null | undefined): boolean {
  const n = normPipe(name);
  return /^ds\b/.test(n) && (/\bdevelopers?\b/.test(n) || n.includes("unvetted"));
}
/** A buyer-NETWORK buyer-agent pipeline — tolerant of "DS: Buyer Agents" variants. */
export function isAgentNetworkName(name: string | null | undefined): boolean {
  const n = normPipe(name);
  return /^ds\b/.test(n) && /\bagents?\b/.test(n);
}

/** The buyer-NETWORK pipelines (developers / agents) — these live in the Dispo CRM,
 *  NOT in the seller CRM selector (Jon 2026-10-20: keep them off the sellers). */
export function isDispoNetworkPipeline(name: string | null | undefined): boolean {
  return isDevNetworkName(name) || isAgentNetworkName(name);
}
export const DISPO_NETWORK_PIPELINES: { name: string; stages: { key: string; label: string }[] }[] = [
  { name: DISPO_DEV_PIPELINE, stages: [
    { key: "new", label: "🆕 New / to research" },
    { key: "researching", label: "🔎 Researching" },
    { key: "reached_out", label: "📞 Reached out" },
    { key: "following_up", label: "🔁 Following up" },
    { key: "vetted", label: "✅ Vetted" },
    { key: "not_fit", label: "✕ Not a fit" },
  ] },
  { name: DISPO_AGENT_PIPELINE, stages: [
    { key: "new", label: "🆕 New" },
    { key: "reached_out", label: "📞 Reached out" },
    { key: "following_up", label: "🔁 Following up" },
    { key: "active", label: "🤝 Active partner" },
    { key: "not_fit", label: "✕ Not a fit" },
  ] },
];
