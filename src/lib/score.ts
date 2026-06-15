// AI scoring of an acquisitions call transcript against a coaching rubric.
// Uses the Anthropic Messages API directly (no SDK). Requires ANTHROPIC_API_KEY
// in the environment; returns { configured: false } if it's not set so the UI
// can show a setup notice instead of erroring.

export interface ScoreArea {
  area: string;
  score: number; // 0-100
  note: string;
}
export interface ScoreResult {
  configured: boolean;
  error?: string;
  overall: number;
  breakdown: ScoreArea[];
  summary: string;
}

function buildRubric(label?: string, script?: string): string {
  const intro = label
    ? `You are an expert real-estate sales coach scoring a "${label}" for a wholesaling team. Each call type is different — score on the skills that matter MOST for this specific kind of call.`
    : `You are an expert real-estate acquisitions sales coach scoring a seller/cold call for a wholesaling team.`;
  const scriptBlock = script
    ? `\n\nThe rep is expected to follow this approved script / process for this exact call type. Judge how closely they followed it and flag meaningful deviations:\n"""\n${script.slice(0, 9000)}\n"""`
    : `\n\n(No script is on file for this call type yet — score on general best practices for this kind of call.)`;
  return `${intro}${scriptBlock}

Score 0-100 on the 4-5 dimensions that matter most for THIS call type${script ? `, and ALWAYS include "Script Adherence" as one of them` : ""}. Pick dimension names appropriate to the call (e.g. rapport, motivation discovery, qualifying, anchoring/price framing, objection handling, setting the next step, closing). Give one short, specific, actionable note per dimension.
Then give an overall 0-100 and a 2-3 sentence summary naming the single highest-leverage thing to improve next time.
Respond with ONLY valid JSON, no markdown:
{"overall": <int>, "breakdown": [{"area": "...", "score": <int>, "note": "..."}, ...], "summary": "..."}`;
}

export async function scoreTranscript(
  transcript: string,
  opts?: { label?: string; script?: string },
): Promise<ScoreResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  const empty: ScoreResult = { configured: false, overall: 0, breakdown: [], summary: "" };
  if (!key) return empty;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: buildRubric(opts?.label, opts?.script),
        messages: [{ role: "user", content: `Score this ${opts?.label ?? "call"} transcript:\n\n${transcript.slice(0, 24000)}` }],
      }),
    });
    if (!res.ok) {
      return { ...empty, configured: true, error: `Scoring API error (${res.status}). Check the API key and billing.` };
    }
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const json = extractJson(text);
    if (!json) return { ...empty, configured: true, error: "Could not parse the score. Try again." };
    return {
      configured: true,
      overall: clampInt(json.overall),
      breakdown: Array.isArray(json.breakdown)
        ? json.breakdown.map((b: { area?: unknown; score?: unknown; note?: unknown }) => ({
            area: String(b.area ?? ""),
            score: clampInt(b.score),
            note: String(b.note ?? ""),
          }))
        : [],
      summary: String(json.summary ?? ""),
    };
  } catch {
    return { ...empty, configured: true, error: "Scoring failed (network)." };
  }
}

function extractJson(text: string): { overall?: unknown; breakdown?: unknown; summary?: unknown } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampInt(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}
