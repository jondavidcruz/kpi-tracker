import { NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SYSTEM = `You are an elite phone-sales coach for Freedom Offers, a San Diego real-estate wholesaling team (veteran-owned, small team that works leads directly — no call centers, no scripts read robotically).

Who the team talks to:
- ACQUISITIONS (e.g. Michelle) talk to SELLERS — discovery, build rapport, make a verbal offer, and get the contract SIGNED.
- DISPOSITIONS (e.g. Sharyn, Marie) talk to BUYERS and DEVELOPERS — find cash buyers, sell deals fast, negotiate price, and reach luxury developers (often through a receptionist/gatekeeper who is wary of scammers).

Coaching rules:
- Give EXACT words to say — real, natural talking tracks the rep can use on the next call. Not theory.
- Sound human and credible, never pushy or "salesy." Developers especially must feel we're legit professionals, not scammers.
- Be concise. Use short labeled sections and bullets. Bold the key lines.
- Tailor everything to the specific rep, skill, and situation given.`;

const audienceFor = (role: string) => (role === "acquisitions" ? "home sellers" : "cash buyers and real-estate developers (often via a gatekeeper)");

function buildPrompt(rep: string, role: string, skill: string, mode: string, context: string): string {
  const who = audienceFor(role);
  const focus = skill || "their sales calls";
  const ctx = context.trim() ? `\n\nSituation / transcript provided:\n${context.trim().slice(0, 8000)}` : "";
  switch (mode) {
    case "openers":
      return `Give ${rep} 4 strong, natural openers / rapport-building lines for "${focus}" when talking to ${who}. Each should be one or two sentences they can say verbatim, plus a one-line why-it-works.${ctx}`;
    case "objections":
      return `List the 6 most common objections ${rep} will hear related to "${focus}" from ${who}, and the best word-for-word response to each. Keep responses short and human.${ctx}`;
    case "roleplay":
      return `Write a realistic role-play script to practice "${focus}" with ${who}. Make the prospect tough but realistic. 6–8 back-and-forth exchanges (Prospect: / ${rep}:), then 2 short coaching notes on what to watch for.${ctx}`;
    case "feedback":
      return `Coach ${rep} on "${focus}". Review the situation/transcript below and give: ✅ what worked, ⚠️ what to fix, and 🎯 the exact lines to use next time. Be specific and direct.${ctx}`;
    case "drill":
      return `Design a focused 10-minute practice drill ${rep} can do to build "${focus}" (with ${who}), plus a single one-line homework assignment for this week.${ctx}`;
    default:
      return `Coach ${rep} on "${focus}" with ${who}. Give the most useful, specific, actionable guidance with exact lines to say.${ctx}`;
  }
}

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!isManager(me)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ reply: "The AI coach isn't configured yet — add ANTHROPIC_API_KEY in Vercel." });

  let body: { rep?: string; role?: string; skill?: string; mode?: string; context?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const rep = String(body.rep || "the rep").slice(0, 60);
  const role = String(body.role || "");
  const skill = String(body.skill || "").slice(0, 120);
  const mode = String(body.mode || "openers");
  const context = String(body.context || "");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 1400,
        system: SYSTEM,
        messages: [{ role: "user", content: buildPrompt(rep, role, skill, mode, context) }],
      }),
    });
    if (!res.ok) return NextResponse.json({ reply: "The AI coach hit an error — try again in a moment." });
    const data = await res.json();
    const reply = (data?.content?.[0]?.text as string) || "No response.";
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ reply: "Couldn't reach the AI coach — try again." });
  }
}
