import { NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SYSTEM = `You are an elite sales TRAINER and coach for Freedom Offers, a San Diego real-estate wholesaling team (veteran-owned, small team that works leads directly).

Who the team talks to:
- ACQUISITIONS (e.g. Michelle) talk to SELLERS — discovery, build rapport, make a verbal offer, and get the contract SIGNED.
- DISPOSITIONS (e.g. Sharyn, Marie) talk to BUYERS and DEVELOPERS — find cash buyers, sell deals fast, negotiate price, and reach luxury developers (often through a receptionist/gatekeeper who is wary of scammers).

Your job is to design TRAINING — lesson plans, practice exercises/drills, and coaching activities a team lead can actually run with a rep this week. NOT robotic scripts.
Rules:
- Make it practical and runnable: clear objective, steps, time estimates, and how to tell it worked.
- When you include example lines, label them as teaching examples to adapt — never a script to read word-for-word.
- Be concise. Short labeled sections + bullets.
- PLAIN TEXT ONLY: no markdown, no asterisks (*), no bold (**), and do NOT wrap words in quotation marks for emphasis. Use emoji or UPPERCASE for headers and "• " for bullets. (Quotation marks are fine ONLY around an exact phrase the rep should say out loud.)
- Tailor everything to the specific rep, skill, and audience.`;

const audienceFor = (role: string) => (role === "acquisitions" ? "home sellers" : "cash buyers and real-estate developers (often via a gatekeeper)");

function buildPrompt(rep: string, role: string, skill: string, mode: string, context: string): string {
  const who = audienceFor(role);
  const focus = skill || "their sales calls";
  const ctx = context.trim() ? `\n\nSituation / transcript provided:\n${context.trim().slice(0, 8000)}` : "";
  switch (mode) {
    case "lesson":
      return `Build a focused LESSON PLAN to teach ${rep} ${focus} (audience: ${who}). Include: 🎯 Objective (what they'll be able to do), 🧠 3–5 key teaching points, 💬 1–2 example lines to illustrate each (clearly marked as examples to adapt), 🏋️ one practice activity to run live, and ✅ how to measure that it stuck. Keep it to something a lead can run in ~20 minutes.${ctx}`;
    case "exercises":
      return `Design 3–5 concrete PRACTICE EXERCISES / drills ${rep} can do to build ${focus} (with ${who}). For each: a name, what to do (steps), how long, and "what good looks like". Make them repeatable so they can be done daily.${ctx}`;
    case "ideas":
      return `Give a coach's playbook of IDEAS for improving ${rep}'s ${focus} (with ${who}): when a recorded-call audit is the right tool vs. live coaching, role-play, shadowing, or homework — and 4–6 specific activities to try, each with the point of it. Be tactical.${ctx}`;
    case "roleplay":
      return `Write a realistic role-play SCENARIO to practice ${focus} with ${who}. Set the scene, give the prospect a tough-but-realistic personality, then 6–8 back-and-forth exchanges (Prospect: / ${rep}:), and end with 2–3 coaching notes on what to watch for. Frame it as a practice rep, not a script to memorize.${ctx}`;
    case "feedback":
      return `Review the situation/transcript below for ${rep} on ${focus} and turn it into a coaching moment: ✅ what worked, ⚠️ what to fix, 🏋️ one drill to fix it, and 🎯 a one-line homework assignment for this week. Be specific and direct.${ctx}`;
    default:
      return `Design a short training activity to help ${rep} improve ${focus} with ${who} — objective, steps, and how to measure it.${ctx}`;
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
