// 🎙 Resilient call transcription (Jon 2026-11-05). The recording.saved handler used to
// fire ONE Gemini call to `gemini-flash-latest` with no retry and no fallback, so when the
// free tier rate-limited under call volume the transcript silently vanished — recordings
// kept filing to Drive, but 29 of 30 had no transcript. This tries the higher-headroom
// LITE model first, falls back to flash, parses tolerantly, and — critically — RETURNS the
// failure reason so /admin/recording-health can show WHY instead of a silent blank.
//
// Models are aliases already used elsewhere in the app (see lib/ai.ts) so they stay valid
// as Google rotates the underlying versions.
const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"];

const PROMPT = `This is a recorded real-estate acquisitions phone call. Reply in EXACTLY this format:
SUMMARY:
- (3 to 6 short bullets covering: seller's motivation to sell, asking price / any numbers discussed, timeline, property condition or issues, objections, and the agreed next step)

TRANSCRIPT:
(full transcript, labeling speakers 'Rep:' and 'Seller:')`;

export type TranscribeResult = { summary: string; transcript: string; error: string };

export async function transcribeCall(bytes: Uint8Array, mime = "audio/mp3"): Promise<TranscribeResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { summary: "", transcript: "", error: "GEMINI_API_KEY not set" };
  if (bytes.length >= 9 * 1024 * 1024) return { summary: "", transcript: "", error: `audio too large (${Math.round(bytes.length / 1024 / 1024)}MB > 9MB cap)` };
  const b64 = Buffer.from(bytes).toString("base64");
  let lastErr = "no models tried";
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: PROMPT }] }], generationConfig: { maxOutputTokens: 4000 } }),
        signal: AbortSignal.timeout(45000),
      });
      if (!r.ok) {
        // 429 = rate/quota (try the next model, which has its own quota pool); other = capture + try next
        lastErr = `${model}: HTTP ${r.status}${r.status === 429 ? " (rate/quota)" : ""}`;
        continue;
      }
      const tj = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const out = tj.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("").trim() ?? "";
      if (!out) { lastErr = `${model}: empty response`; continue; }
      // Tolerant parse: if the TRANSCRIPT: delimiter is missing (format drift), keep the whole
      // output as the transcript rather than dropping it.
      const parts = out.split(/\n\s*TRANSCRIPT:\s*\n/i);
      const summary = (parts[0] || "").replace(/^\s*SUMMARY:\s*\n?/i, "").trim();
      const transcript = (parts[1] || (parts.length === 1 ? out : "")).trim();
      return { summary, transcript, error: "" };
    } catch (e) {
      lastErr = `${model}: ${String(e).slice(0, 80)}`;
    }
  }
  return { summary: "", transcript: "", error: lastErr };
}
