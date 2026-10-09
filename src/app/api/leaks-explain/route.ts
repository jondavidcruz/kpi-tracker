import { NextResponse } from "next/server";
import { getCurrentUser, canAccessPayroll } from "@/lib/auth";
import { aiText, AI_CONFIGURED } from "@/lib/ai";

export const dynamic = "force-dynamic";

const SYSTEM = `You are a sharp operating partner for Freedom Offers, a small San Diego real-estate wholesaling team (veteran-owned). The team: Jon (owner, proven closer) and Michelle (1 full-time acquisitions rep he's training to make offers + negotiate). Michelle calls every lead, runs the process call, and makes offers; if she can't get it signed, Jon co-closes. Sharyn + Marie handle dispositions. They buy cheap motivated-seller leads (~$7–15) via iSpeedToLead.

You're given their live conversion funnel + unit economics. Explain it like you're talking to the owner: what the numbers mean, where the business is actually leaking, why, and what to do — in priority order. Be specific, direct, and practical. Reference the real stages and numbers. Use short labeled sections and bullets. End with the single most important thing to fix first. Keep it tight — this is a recurring read, not an essay.`;

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!AI_CONFIGURED()) return NextResponse.json({ reply: "Add ANTHROPIC_API_KEY or GEMINI_API_KEY in Vercel to enable the full AI breakdown." });

  let body: { data?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const data = String(body.data || "").slice(0, 5000);

  try {
    const reply = await aiText({ system: SYSTEM, maxTokens: 1500, messages: [{ role: "user", content: `Here is our live war-room funnel + economics (JSON). Break it down for me — where are we failing and what do I fix first?\n\n${data}` }] });
    return NextResponse.json({ reply: reply || "The breakdown hit an error — try again." });
  } catch {
    return NextResponse.json({ reply: "Couldn't reach the analysis — try again." });
  }
}
