import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { aiText, AI_CONFIGURED } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 🔴 Lien timeline cleaner (Jon 2026-10-20): turn the raw CRM activity into a clean,
// SELLER-ONLY affidavit timeline. Drops notes about buyers, owner/follower changes,
// automations and form updates — keeps only what happened with the seller and their
// failure to close. Falls back to a plain chronological list if AI isn't configured.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "no auth" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { events?: { kind: string; body: string; actor: string; at: string }[]; seller?: string; property?: string; contractDate?: string };
  const events = Array.isArray(body.events) ? body.events : [];
  const seller = (body.seller || "the seller").trim();
  const property = (body.property || "the property").trim();

  // Chronological, with readable dates, as the model's raw material.
  const sorted = [...events].filter((e) => e.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const lines = sorted.map((e) => `[${new Date(e.at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}] (${e.kind}) ${(e.body || "").replace(/\s+/g, " ").trim()}`).filter((l) => l.length > 20).join("\n");

  if (!AI_CONFIGURED() || !lines) {
    return NextResponse.json({ timeline: fallback(sorted, seller, property, body.contractDate) });
  }

  const system = `You compile a factual, chronological affidavit-of-interest timeline for a real-estate lien (Memorandum of Contract). You are given raw CRM activity for one deal. Produce a clean bulleted timeline of ONLY what is relevant to the SELLER and this contract — their communications, commitments, delays, and their failure/refusal to close.

STRICT RULES:
- Keep ONLY events involving the seller, their representatives/family, their property, the agreement, escrow/title, and their refusal to close.
- DROP anything about our cash buyers / end buyers, owner or follower assignments, internal team notes, automations, form/field updates, and system messages.
- One bullet per event. Start each with "On <Month Day, Year>, ...". Be factual and professional; no speculation, no legal conclusions.
- Merge duplicates and near-duplicates. Keep the seller's name as given. Do not invent facts or dates.
- Output ONLY the bullet lines (each on its own line, no leading dash), nothing else.`;

  const user = `Seller: ${seller}\nProperty: ${property}\n${body.contractDate ? `Contract date: ${body.contractDate}\n` : ""}\nRaw activity (chronological):\n${lines.slice(0, 12000)}`;

  try {
    const out = await aiText({ system, maxTokens: 1500, messages: [{ role: "user", content: user }] });
    const cleaned = (out || "").split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean).join("\n");
    return NextResponse.json({ timeline: cleaned || fallback(sorted, seller, property, body.contractDate) });
  } catch {
    return NextResponse.json({ timeline: fallback(sorted, seller, property, body.contractDate) });
  }
}

// Heuristic fallback: seller-relevant kinds only, no buyers/followers/automations.
function fallback(sorted: { kind: string; body: string; at: string }[], seller: string, property: string, contractDate?: string): string {
  const skip = /buyer|follower|owner:|assigned|automation|updated \(|imported from|\.__|land details|home details/i;
  const keep = sorted.filter((e) => ["note", "call", "sms", "email", "appt", "stage", "system"].includes(e.kind) && !skip.test(e.body || ""));
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const lines = keep.map((e) => `On ${fmt(e.at)}, ${(e.body || "").replace(/\s+/g, " ").trim()}.`).filter((l) => l.length > 16);
  return [`On ${contractDate || "[contract date]"}, Freedom Offers LLC entered into a signed agreement with ${seller} to purchase ${property}.`, ...lines].join("\n");
}
