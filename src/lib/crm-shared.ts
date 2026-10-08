// Client-safe CRM constants & pure helpers — NO database imports here.
// (CrmKanban is a "use client" component; importing lib/crm.ts from it would
// drag Prisma into the browser bundle and crash the whole /crm page.)

export type CrmStage = { key: string; label: string; cls: string };

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

export function parseTags(s: string): string[] {
  return s.split(",").map((t) => t.trim()).filter(Boolean);
}

export function stageSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "stage";
}

/** GHL notes arrive as HTML — render them as clean text with line breaks. */
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
