// Snippets (canned SMS/email) + email Sequences — the in-house replacement
// for Direct REI's email drip (Jon 2026-10-07: "they can always email and it
// has a sequence set up"). Both live in Resource JSON side-stores; sends go
// through Resend with reply-to Jon, and every send logs to the lead timeline.
import { db } from "./db";

const SNIP_CAT = "__crm_snippets__";
const SEQ_CAT = "__crm_sequences__";
const SEQ_STATE_CAT = "__crm_seq_state__";

export type Snippet = { id: string; name: string; kind: "sms" | "email"; subject?: string; body: string };
export type SeqStep = { day: number; subject: string; body: string }; // day = offset from enrollment
export type Sequence = { id: string; name: string; steps: SeqStep[] };
export type SeqState = Record<string, { seqId: string; step: number; nextYmd: string; email: string; enrolledBy: string; startedYmd: string }>; // key = oppId

async function readJson<T>(cat: string, fallback: T): Promise<T> {
  const row = await db.resource.findFirst({ where: { category: cat } }).catch(() => null);
  try { return row?.description ? (JSON.parse(row.description) as T) : fallback; } catch { return fallback; }
}
async function writeJson(cat: string, title: string, v: unknown): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: cat } });
  const description = JSON.stringify(v);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title, category: cat, url: "", description } });
}

// ── Snippets ────────────────────────────────────────────────────────────────
export const DEFAULT_SNIPPETS: Snippet[] = [
  { id: "sms-intro", name: "Intro text", kind: "sms", body: "Hi {name}, this is {rep} with Freedom Offers — following up on your land. Still open to an offer if the number makes sense?" },
  { id: "sms-followup", name: "Follow-up text", kind: "sms", body: "Hi {name}, {rep} here with Freedom Offers. Circling back on your property — we're ready to move quickly when you are. Good time for a 5-minute call?" },
  { id: "sms-offer", name: "Offer on the way", kind: "sms", body: "{name}, good news — we've got our numbers back and I'd love to walk you through our offer. When works today for a quick call?" },
  { id: "em-intro", name: "Intro email", kind: "email", subject: "Your land — quick question", body: "Hi {name},\n\nThis is {rep} with Freedom Offers. We buy land for cash, as-is, with no fees or commissions — and we cover closing costs.\n\nAre you still open to an offer on your property? If so, I'd love 5 minutes to confirm a few details so we can get you a real number quickly.\n\nBest,\n{rep}\nFreedom Offers" },
  { id: "em-offer-follow", name: "Offer follow-up email", kind: "email", subject: "Following up on our offer", body: "Hi {name},\n\nJust making sure our offer didn't get buried. Happy to answer any questions, and if the number isn't right, tell me what works and I'll see what we can do.\n\nBest,\n{rep}\nFreedom Offers" },
];

export async function readSnippets(): Promise<Snippet[]> {
  const v = await readJson<Snippet[]>(SNIP_CAT, []);
  return v.length ? v : DEFAULT_SNIPPETS;
}
export async function writeSnippets(list: Snippet[]): Promise<void> {
  await writeJson(SNIP_CAT, "crm-snippets", list.slice(0, 50));
}
export function fillTemplate(t: string, vars: { name?: string; rep?: string }): string {
  return t.replaceAll("{name}", (vars.name ?? "").split(" ")[0] || "there").replaceAll("{rep}", (vars.rep ?? "").split(" ")[0] || "Freedom Offers");
}

// ── Sequences ───────────────────────────────────────────────────────────────
export const DEFAULT_SEQUENCES: Sequence[] = [{
  id: "land-seller-5",
  name: "Land seller — 5-touch email drip",
  steps: [
    { day: 0, subject: "Your land — a real cash offer, no fees", body: "Hi {name},\n\n{rep} here with Freedom Offers. We buy land for cash, as-is — no agent commissions, no closing costs, no cleanup.\n\nIf you're still open to selling, reply here (or just hit reply with a good time to call) and we'll get you a real number fast.\n\nBest,\n{rep}\nFreedom Offers" },
    { day: 2, subject: "Quick follow-up on your property", body: "Hi {name},\n\nJust floating this back to the top of your inbox. We're actively buying in your area right now and can usually have an offer together within 24–48 hours of a quick call.\n\nAny interest in hearing the number?\n\n{rep}\nFreedom Offers" },
    { day: 5, subject: "No pressure — just checking", body: "Hi {name},\n\nNo pressure at all — people sell land for a hundred different reasons and timing is everything. If now isn't right, I'm happy to check back later this year.\n\nIf it IS the right time, I'm one reply away.\n\n{rep}\nFreedom Offers" },
    { day: 10, subject: "What most land owners ask us", body: "Hi {name},\n\nThe three questions we hear most:\n1. \"As-is?\" — Yes, truly as-is. Back taxes, liens, access issues — we work through all of it.\n2. \"Fees?\" — None. We cover closing costs; the offer you see is what you get.\n3. \"How fast?\" — Typically 2–4 weeks to money in hand.\n\nWant your number?\n\n{rep}\nFreedom Offers" },
    { day: 18, subject: "Last note from me", body: "Hi {name},\n\nI'll stop filling your inbox after this one. If you'd ever like a no-obligation cash offer on the property, just reply to any of my emails — I keep everything on file so it's a fast conversation.\n\nAll the best,\n{rep}\nFreedom Offers" },
  ],
}];

export async function readSequences(): Promise<Sequence[]> {
  const v = await readJson<Sequence[]>(SEQ_CAT, []);
  return v.length ? v : DEFAULT_SEQUENCES;
}
export async function writeSequences(list: Sequence[]): Promise<void> {
  await writeJson(SEQ_CAT, "crm-sequences", list.slice(0, 20));
}
export async function readSeqState(): Promise<SeqState> {
  return readJson<SeqState>(SEQ_STATE_CAT, {});
}
export async function writeSeqState(v: SeqState): Promise<void> {
  await writeJson(SEQ_STATE_CAT, "crm-seq-state", v);
}
export function ymdPlus(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
