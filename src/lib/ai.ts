// One front door for AI text (Jon 2026-10-09: "never let a Claude bill block
// the team"): try Anthropic first, and on ANY failure — empty credits, outage,
// missing key — silently fall back to Gemini's free tier. Returns "" only when
// both engines fail, so callers show one honest error instead of a billing one.
type Msg = { role: string; content: string };

export async function aiText(opts: { system?: string; messages: Msg[]; maxTokens?: number; model?: string; timeoutMs?: number }): Promise<string> {
  const { system, messages, maxTokens = 1200, model = "claude-opus-4-8", timeoutMs = 50_000 } = opts;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: maxTokens, ...(system ? { system } : {}), messages }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const j = (await res.json()) as { content?: Array<{ text?: string }> };
        const t = j.content?.map((c) => c.text ?? "").join("").trim();
        if (t) return t;
      } else {
        console.error("anthropic error → gemini fallback", res.status, (await res.text().catch(() => "")).slice(0, 300));
      }
    } catch (e) { console.error("anthropic unreachable → gemini fallback", String(e).slice(0, 120)); }
  }
  if (process.env.GEMINI_API_KEY) {
    // Cascade of free-tier models: Google 503s individual models under load
    // and retires pinned versions, so try the rolling alias first and fall
    // through to lighter models that nearly always have capacity.
    for (const gm of ["gemini-flash-latest", "gemini-3.8-flash", "gemini-flash-lite-latest"]) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gm}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
            generationConfig: { maxOutputTokens: Math.max(2000, maxTokens) },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) {
          const j = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
          const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
          if (t) return t;
        } else {
          console.error("gemini error", gm, res.status, (await res.text().catch(() => "")).slice(0, 200));
        }
      } catch (e) { console.error("gemini unreachable", gm, String(e).slice(0, 120)); }
    }
  }
  return "";
}

export const AI_CONFIGURED = () => !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
