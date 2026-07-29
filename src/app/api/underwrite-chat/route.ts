import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 529 = Anthropic overloaded, 429 = rate-limited, 5xx = transient server blip.
// All are worth a quick retry — none are a key/billing problem.
const TRANSIENT = new Set([429, 500, 502, 503, 504, 529]);

const PLAYBOOK = `You are the Freedom Offers underwriting assistant inside the War Room. You help the dispositions and acquisitions team underwrite real-estate wholesale deals fast and accurately. Be concise, practical, and numbers-first. When you have the inputs, DO the math and show the result. If a key input is missing (ARV, repairs, market tier), ask for just that one thing.

FREEDOM OFFERS PLAYBOOK — use exactly this methodology:

1) MARKET TIER (% of ARV the flipper/end value supports — higher tier = more desirable = offer a higher % because resale is fast & certain):
- Prime Coastal / Ultra-Desirable: 85% (push to 88–90% on oceanfront/trophy) — beachfront, water-adjacent, trophy neighborhoods (La Jolla, Del Mar, Coronado, Laguna, Newport Coast)
- Highly Competitive Urban: 80% — dense, fast, high demand
- Strong Suburban / Metro: 75%
- Mid-Tier Cities: 70%
- Rural Markets: 65%
- Extremely Rural: 60% or lower — low velocity, big discount needed

2) ASSIGNMENT (cash) MAO = (ARV × Market%) − Repairs − Assignment fee.
Also think in the flipper's shoes: subtract their holding/money cost (months × monthly carry) when the carry is meaningful or the market is slow. Anchor (opening offer) ≈ 10% below MAO; negotiate up to MAO.

3) REPAIRS = Square Feet × $/sf. Rehab $/sf guide: Cleanup 15–20, Lipstick 20–25, Interior 30, Full 35, then +5/sf per big-ticket item (HVAC, roof, foundation, electrical, plumbing, mold/water, pool, windows) up to ~75/sf for a full gut with many big items.

4) NOVATION = list at CURRENT similar-condition value (NOT ARV). MAO (max seller payout) = (List − buyer repair credit) − (closing% + commission%)×List − our desired profit. No holding costs (retail buyer pays their own; buyer uses financing). We cover the seller's closing + agent commission; disclose we market higher to make it work. List conservatively to sell under 90 days — bias toward the lower comps. Anchor ≈ 7% below the max payout.

5) CREATIVE — only two: (a) Seller finance (seller owns free & clear, we agree on price/down/monthly/term), (b) Subject-to (assume their existing loan, take over payments). We make money by ASSIGNING the terms to an end buyer who wants them and collecting an assignment fee.

6) LISTING — traditional listing with our agent; we collect a referral/marketing fee (industry standard 25% of the listing-side commission, or a flat $2,500–$5,000).

7) FLIP / WHOLETAIL (buyer's-lens) — Max Offer = ARV + purchase-commission credit − minimum profit − TOTAL COSTS. TOTAL COSTS = property costs + money costs. Property costs = rehab + realtor commission (~3% of ARV) + closing (~2%) + utilities/taxes/insurance (~1%) + monthly HOA × hold months + project manager. Money costs (hard money) = points (loan × ~1%) + interest ((loan × rate ÷ 12) × hold months) + service fee (+ optional gap loan interest). Minimum profit target $30k. Hard-money presets: Kiavi ~9.45%/2.5pts/$1500, Iron Bridge ~9%/2pts, Zinc ~11.5%/1.75pts. Wholetail = same math with a lighter rehab.

PROFIT RULES: minimum profit we accept is $15,000; always shoot for 2× ($30,000+).

EXIT DECISION (recommend the best exit):
- Distressed / needs repairs / seller wants a fast cash sale → ASSIGNMENT
- Good condition or light cosmetic / seller wants top dollar & will cooperate → NOVATION
- Seller has a loan and wants payment relief → SUBJECT-TO
- Seller owns free & clear and is flexible on terms → SELLER FINANCE
- Clean, high value, seller just wants market price → LISTING

Never invent comps or sold prices you don't have — ask the team for the comps/ARV. You can estimate repairs from sqft + condition. Keep answers tight; use short bullets and bolded numbers.`;

export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ reply: "The AI assistant isn't configured yet (missing ANTHROPIC_API_KEY)." });

  let body: { messages?: { role: string; content: string }[]; context?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const msgs = (body.messages ?? []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12);
  if (msgs.length === 0) return NextResponse.json({ error: "no messages" }, { status: 400 });

  const system = body.context ? `${PLAYBOOK}\n\nCURRENT DEAL CONTEXT (from the calculator on screen):\n${String(body.context).slice(0, 1500)}` : PLAYBOOK;

  const payload = JSON.stringify({
    model: "claude-opus-4-8",
    max_tokens: 1200,
    system,
    messages: msgs.map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
  });

  // Up to 3 tries; back off on transient overload/rate-limit before giving up.
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(attempt === 1 ? 700 : 1800);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: payload,
      });
      if (res.ok) {
        const data = await res.json();
        const reply: string = data?.content?.[0]?.text ?? "Sorry — no answer came back. Try rephrasing.";
        return NextResponse.json({ reply });
      }
      lastStatus = res.status;
      if (TRANSIENT.has(res.status)) continue; // overloaded/rate-limited → retry
      // Non-transient: don't waste retries.
      if (res.status === 401 || res.status === 403) return NextResponse.json({ reply: "⚠️ The AI assistant's access needs attention (auth). Let Jon know — the API key may need renewing." });
      return NextResponse.json({ reply: `The assistant hit an error (${res.status}). Try again in a moment.` });
    } catch {
      lastStatus = -1; // network blip — worth another try
    }
  }
  // All retries exhausted.
  const busy = lastStatus === 429 || lastStatus === 529 || (lastStatus >= 500 && lastStatus < 600);
  return NextResponse.json({ reply: busy
    ? "🤖 The AI is busy right now (high demand). Give it a few seconds and hit Send again — your numbers are still here."
    : "The assistant couldn't be reached. Check your connection and try again." });
}
