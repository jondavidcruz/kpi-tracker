import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ✨ AI reduction script (Jon 2026-10-09): the rep types raw bullets
// ("roof bad", "ac old") — Claude turns them into a professional seller
// call script with real materials/trade language, built on the deal math.
export async function POST(req: NextRequest) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "dispositions", "cc_lm"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI key not configured" }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as {
    dealType?: string; address?: string; contract?: number; best?: number; fee?: number;
    agentFees?: number; coveredClosing?: number; offers?: number; dom?: number;
    repairs?: string; feedback?: string; settle?: number; target?: number;
  };
  if (!b.contract || !b.best || !b.settle) return NextResponse.json({ error: "fill the numbers first" }, { status: 400 });

  const prompt = `You are coaching a brand-new real-estate acquisitions rep through a PRICE REDUCTION call with a seller. Write the exact script they will read aloud, word for word.

DEAL FACTS (never reveal our fee or internal math to the seller):
- Property: ${b.address || "the property"}
- Deal type: ${b.dealType === "novation" ? "novation — WE cover the seller's closing costs; the property is listed with an agent" : "assignment — the buyer covers all closing costs"}
- Current agreement with seller: $${b.contract.toLocaleString()}
- ${b.dealType === "novation" ? "End-buyer sale price" : "Best real buyer offer"}: $${b.best.toLocaleString()}
- Days on market: ${b.dom || "several weeks"} · Serious offers received: ${b.offers || "multiple"}
- OPEN THE ASK AT: $${(b.target ?? b.settle).toLocaleString()} (leave room to meet in the middle)
- THE NUMBER THAT MUST CLOSE: $${b.settle.toLocaleString()} (anything at or above this is a yes)

RAW REPAIR NOTES FROM BUYERS (rough bullets — turn these into specific, credible contractor language with realistic materials, trades and cost ranges; expand abbreviations; sound like someone who has walked job sites):
${b.repairs || "(none given — lean on days-on-market and current market conditions instead)"}

STRONGEST BUYER QUOTE (weave it in naturally if present): ${b.feedback || "(none)"}

MARKET CONTEXT TO USE: elevated mortgage rates, high material costs, the property has already been exposed to the market so every serious buyer has seen it.

RULES FOR THE SCRIPT:
- Warm, honest, factual — the rep is the messenger of what buyers said, never criticizing the house personally.
- Specific trade language for each repair (e.g. "architectural shingle tear-off and re-deck", "stem-wall crack needing epoxy injection and a structural letter") — credible, not exaggerated, with rough cost ranges a contractor would quote.
- Present the ask number ONCE, then instruct the rep: [PAUSE — say nothing until they respond].
- Include short [IF THEY SAY NO] and [IF THEY COUNTER] branches (counter at or above $${b.settle.toLocaleString()} = accept and close).
- Never mention our fee, our buyer's identity, or the word "wholesale".
- Under 350 words of spoken script. Output ONLY the script with the two branch blocks — no preamble, no explanation.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
    });
    const j = (await res.json()) as { content?: Array<{ text?: string }>; error?: { message?: string } };
    const text = j.content?.map((c) => c.text ?? "").join("").trim();
    if (!text) return NextResponse.json({ error: j.error?.message ?? "AI gave no script" }, { status: 502 });
    return NextResponse.json({ script: text });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 150) }, { status: 502 });
  }
}
