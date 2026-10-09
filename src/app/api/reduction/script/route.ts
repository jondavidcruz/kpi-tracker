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
    dealType?: string; propType?: string; address?: string; contract?: number; best?: number; fee?: number;
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

PROPERTY TYPE: ${b.propType === "land" ? "VACANT LAND — the issues below are land due-diligence problems (easements, protected species like gopher tortoises or scrub jays, wetlands, legal access, clearing, fill, perc/septic, utilities), NOT house repairs" : "single-family house"}.

RAW ${b.propType === "land" ? "ISSUE" : "REPAIR"} NOTES FROM BUYERS (rough bullets — turn these into specific, credible ${b.propType === "land" ? "land-development and entitlement language with realistic permit, mitigation, survey and site-work cost ranges; sound like a land consultant who deals with counties and environmental agencies weekly" : "contractor language with realistic materials, trades and cost ranges; expand abbreviations; sound like someone who has walked job sites"}):
${b.repairs || "(none given — lean on days-on-market and current market conditions instead)"}

STRONGEST BUYER QUOTE (weave it in naturally if present): ${b.feedback || "(none)"}

MARKET CONTEXT TO USE: elevated mortgage rates, high material costs, the property has already been exposed to the market so every serious buyer has seen it.

RULES FOR THE SCRIPT:
- CRITICAL WORDING: when speaking to the seller, NEVER say "buyer" or "buyers" — always call them "our funding partners" (or "our partners"). The seller must feel WE are in the deal with them and our partners fund the close; "buyers" makes them think we're not the ones buying and kills reductions. Same for the quote: introduce it as what one of our funding partners said.
- Warm, honest, factual — the rep is the messenger of what our funding partners found, never criticizing the property personally.
- Specific trade language for each repair (e.g. "architectural shingle tear-off and re-deck", "stem-wall crack needing epoxy injection and a structural letter") — credible, not exaggerated, with rough cost ranges a contractor would quote.
- Present the ask number ONCE, then instruct the rep: [PAUSE — say nothing until they respond].
- Include short [IF THEY SAY NO] and [IF THEY COUNTER] branches (counter at or above $${b.settle.toLocaleString()} = accept and close).
- Never mention our fee, our buyer's identity, or the word "wholesale".
- Under 350 words of spoken script.

ALSO act as ${b.propType === "land" ? `a land due-diligence consultant pricing what each issue costs the BUYER to cure or absorb: for EACH raw issue bullet, give the professional line-item scope and a realistic cost range (low/high, whole dollars — e.g. gopher tortoise survey + permitted relocation $3,000–$15,000 depending on burrow count; scrub-jay habitat review and mitigation $5,000–$25,000+; easement title curative / attorney work $2,500–$8,000; lot clearing and grubbing $3,000–$10,000 per acre; wetlands delineation + impacts $4,000–$20,000; no legal access / easement acquisition $5,000–$25,000; well + septic w/ perc test $15,000–$35,000). Where an issue mostly kills VALUE rather than carrying a fixed cost (flood zone, odd shape), price the market-value impact instead and say so in the scope line` : `a licensed general contractor doing a walk-through: for EACH raw repair bullet, give the professional line-item scope and a realistic installed-cost range (low/high, whole dollars, national-average pricing — e.g. full architectural-shingle roof replacement $9,000–$15,000; foundation stem-wall crack repair w/ structural letter $8,000–$18,000; full rewire $12,000–$30,000). Scale to the repair as described; when size is unknown assume a typical 1,500 sq ft single-family home`}. The script should quote these same numbers so the rep sounds like ${b.propType === "land" ? "the due-diligence reports are already on their desk" : "a GC walked the property"}.

OUTPUT STRICTLY AS JSON — no markdown fences, no commentary, exactly this shape:
{"script": "<the full spoken script with [PAUSE] and the two branch blocks>", "estimates": [{"item": "<short repair name>", "pro": "<one-line professional scope, trade language>", "low": <number>, "high": <number>}]}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-opus-4-8", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
    });
    const j = (await res.json()) as { content?: Array<{ text?: string }>; error?: { message?: string } };
    const text = j.content?.map((c) => c.text ?? "").join("").trim();
    if (!text) return NextResponse.json({ error: j.error?.message ?? "AI gave no script" }, { status: 502 });
    // the model answers in the JSON contract above; fall back to raw text as the script
    try {
      const cleaned = text.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
      const out = JSON.parse(cleaned) as { script?: string; estimates?: Array<{ item?: string; pro?: string; low?: number; high?: number }> };
      if (out.script) return NextResponse.json({ script: out.script, estimates: out.estimates ?? [] });
    } catch { /* non-JSON — serve as plain script */ }
    return NextResponse.json({ script: text, estimates: [] });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 150) }, { status: 502 });
  }
}
