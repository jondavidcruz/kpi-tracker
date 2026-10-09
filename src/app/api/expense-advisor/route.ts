import { NextResponse } from "next/server";
import { getCurrentUser, canAccessPayroll } from "@/lib/auth";
import { aiText, AI_CONFIGURED } from "@/lib/ai";

export const dynamic = "force-dynamic";

const SYSTEM = `You are a sharp, frugal fractional CFO for a small San Diego real-estate wholesaling business that is currently UNPROFITABLE and burning cash. Your job is to help them CUT THE FAT.

Context you know about their stack:
- They buy motivated-seller leads cheaply via iSpeedToLead (credits, ~$3–29/lead) — this is efficient, keep it.
- REIReply is their CRM (core, keep). They're testing a second CRM (DirectREI, $29/mo) — never pay for two CRMs.
- They were considering cutting PropStream and BatchDialer/BatchLeads (list-pulling tools they don't need now that they buy leads). Regrid ($10) is a cheap parcel tool.
- Payroll = overseas contractors. Twilio = phone/SMS.

Rules:
- Be specific and direct. Name the exact line items to cut, downgrade, renegotiate, or consolidate.
- Estimate the monthly/annual $ saved for each idea.
- Flag duplicates/overlap, underused software, anything that grew, and subscriptions that could go annual.
- Rank ideas by impact (biggest savings first). 6–9 concrete actions.
- End with a one-line "fastest path back to breakeven" summary.
- Use short bold headers + bullets. No fluff.`;

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!canAccessPayroll(me)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!AI_CONFIGURED()) return NextResponse.json({ reply: "Add ANTHROPIC_API_KEY or GEMINI_API_KEY in Vercel to enable cut-the-fat recommendations." });

  let body: { data?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const data = String(body.data || "").slice(0, 6000);

  try {
    const reply = await aiText({ system: SYSTEM, maxTokens: 1500, messages: [{ role: "user", content: `Here is our live P&L data (JSON). Tell us exactly how to cut the fat and get back to profitable:\n\n${data}` }] });
    return NextResponse.json({ reply: reply || "The advisor hit an error — try again." });
  } catch {
    return NextResponse.json({ reply: "Couldn't reach the advisor — try again." });
  }
}
