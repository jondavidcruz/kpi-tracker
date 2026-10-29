// Client-safe CRM constants & pure helpers — NO database imports here.
// (CrmKanban is a "use client" component; importing lib/crm.ts from it would
// drag Prisma into the browser bundle and crash the whole /crm page.)

export type CrmStage = { key: string; label: string; cls: string };

// 🧹 The old auto-rolled "Buyer/agent notes" block that got crammed into a lead's
// pinned note looked terrible (Jon 2026-10-21). We stopped writing it; this strips
// any leftover block at display so pinned notes read clean everywhere.
export const AGENT_NOTES_MARK = "— 📇 Buyer/agent notes (auto) —";

/** 🎧 Playable <audio> src for a call recording: Drive links get streamed through the
 *  app's /api/recording proxy (range-capable) so they actually play; other links pass
 *  through unchanged (Jon 2026-10-23). */
export function recStreamSrc(link?: string | null): string {
  if (!link) return "";
  return /drive\.google\.com/.test(link) ? `/api/recording?id=${encodeURIComponent(link)}` : link;
}
export function stripAgentNotesBlock(note?: string | null): string {
  if (!note) return "";
  return note.split(AGENT_NOTES_MARK)[0].trimEnd();
}

// 📦 Multi-parcel land deals (Jon 2026-10-21): one seller / one deal can own several
// parcels. Capture them as a structured list on the opp (formData.land.parcels) —
// NOT crammed into the address field, and NOT split into separate cards.
export type Parcel = { address: string; apn?: string };
export function readParcels(formData: unknown): Parcel[] {
  const raw = (formData as { land?: { parcels?: unknown } } | null)?.land?.parcels;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Parcel => !!p && typeof p === "object" && typeof (p as Parcel).address === "string")
    .map((p) => ({ address: String(p.address).trim(), apn: p.apn ? String(p.apn).trim() : undefined }))
    .filter((p) => p.address || p.apn);
}
/** Split the legacy crammed fields ("addr | addr | addr" + "apn & apn") into parcels. */
export function splitCrammedParcels(address?: string | null, apn?: string | null): Parcel[] {
  const addrs = (address || "").split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  const apns = (apn || "").split(/\s*[&,]\s*/).map((s) => s.trim()).filter(Boolean);
  const n = Math.max(addrs.length, apns.length);
  if (n <= 1) return [];
  const out: Parcel[] = [];
  for (let i = 0; i < n; i++) out.push({ address: addrs[i] || "", apn: apns[i] || undefined });
  return out.filter((p) => p.address || p.apn);
}
/** How many parcels this deal has (structured list, else detected from crammed fields). */
export function parcelCount(formData: unknown, address?: string | null, apn?: string | null): number {
  const p = readParcels(formData);
  return p.length || splitCrammedParcels(address, apn).length;
}

// Built around Jon's land SOP — including the 24–48h developer-pricing stage.
export const CRM_STAGES: CrmStage[] = [
  { key: "new", label: "New Lead", cls: "bg-sky-100 text-sky-800" },
  { key: "contacted", label: "Contacted", cls: "bg-yellow-100 text-yellow-800" },
  { key: "process_call", label: "Process Call ✓", cls: "bg-violet-100 text-violet-800" },
  { key: "at_developers", label: "🏗 At Developers", cls: "bg-amber-100 text-amber-800" },
  { key: "offer_made", label: "Offer Made", cls: "bg-blue-100 text-blue-800" },
  { key: "contract_sent", label: "Contract Sent", cls: "bg-emerald-100 text-emerald-800" },
  { key: "signed", label: "Signed 🎉", cls: "bg-emerald-200 text-emerald-900" },
  { key: "nurture", label: "🌱 Nurture", cls: "bg-lime-100 text-lime-800" },
  { key: "dead", label: "Dead", cls: "bg-slate-200 text-slate-600" },
];

// Pipedrive-style stage probabilities → weighted pipeline value per column.
export const STAGE_PROB: Record<string, number> = {
  new: 0.05, contacted: 0.1, process_call: 0.25, at_developers: 0.4,
  offer_made: 0.6, contract_sent: 0.8, signed: 1, nurture: 0.02, dead: 0,
};

export const KIND_EMOJI: Record<string, string> = {
  file: "📎",
  note: "📝", call: "📞", sms: "💬", email: "✉️", stage: "🔀", task: "✅", appt: "📅", system: "✨",
};

// 🪧 Row icon that never DOUBLES the emoji (Jon 2026-10-29: "it's showing the emoji twice").
// Many event bodies already START with their own emoji (📎 …, ✅ …, 📞 …) — so if the body
// leads with any emoji, show the body's own and skip the kind icon.
export function rowIcon(kind: string, body: string, fallback = "•"): string {
  if (/^\s*\p{Extended_Pictographic}/u.test(String(body || ""))) return "";
  return KIND_EMOJI[kind] ?? fallback;
}

export function parseTags(s: string): string[] {
  return s.split(",").map((t) => t.trim()).filter(Boolean);
}

// 🔀 Order pipeline options: War Room first, then all AQ (acquisitions) together, then all DS
// (dispositions) together, then the rest (DNC, etc.). Stable within each group, so the pipelines
// keep their own order (Jon 2026-10-29: "all AQ together and all DS together"). "AQjr" counts as AQ.
export function sortPipesAqThenDs(names: string[]): string[] {
  const rank = (n: string) => /^war\s*room$/i.test(n) ? -1 : /^aq/i.test(n) ? 0 : /^ds/i.test(n) ? 1 : 2;
  return names.map((n, i) => [n, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([n]) => n);
}

/**
 * ☎ One phone normalizer for EVERY place a contact gets created by hand
 * (new-lead form, bell quick-text, intake webhooks). Returns +1XXXXXXXXXX or "".
 * Handles the real inputs the team pastes: "(305) 607-6099", "1-305-607-6099",
 * "+13056076099", and spreadsheet floats like "3056076099.0" — that last one
 * used to become +10560760990 (digits-then-last-10 kept the trailing 0 and
 * dropped the area code's 3), i.e. a contact whose texts went to a wrong
 * number (crm-enhancer audit 2026-10-19). Non-US / wrong-length → "".
 */
export function toE164US(raw: string | null | undefined): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  // spreadsheet export artefacts: "3056076099.0", "3.056076099E9"
  if (/^\d+\.\d+e\+?\d+$/i.test(s)) { const n = Number(s); if (Number.isFinite(n)) s = String(Math.round(n)); }
  s = s.replace(/\.0+$/, "");
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

/** "(305) 607-6099" for display when a contact has no name yet. */
export function prettyPhone(e164: string): string {
  const d = (e164 || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

export function stageSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "stage";
}

/** GHL notes arrive as HTML — render them as clean text with line breaks. */
// 🔤 GHL imports store names ALL CAPS ("BASSAM REFAI") — display "Bassam Refai".
// Leaves phone-number placeholders alone; keeps LLC / roman numerals upper.
export function titleCase(s: string): string {
  if (!s) return s;
  if (/^[\d()+\-.\s]+$/.test(s.trim())) return s.trim();
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Llc|Ii|Iii|Iv)\b/g, (m) => m.toUpperCase());
}

export function stripHtml(s: string): string {
  return s
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Public "leave us a review" link (Jon 2026-10-07) — used by the ⭐ snippets.
export const GOOGLE_REVIEW_LINK = "https://g.page/r/Cd9ldgWyl4akEAE/review";
