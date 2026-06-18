// Transcribe a call recording with Google's Gemini API (free tier). Audio is
// sent inline and NOT stored anywhere by us — Gemini returns text, we keep only
// the transcript. Requires GEMINI_API_KEY in the environment.

export interface TranscribeResult {
  configured: boolean;
  text?: string;
  error?: string;
}

export async function transcribeAudio(base64: string, mimeType: string): Promise<TranscribeResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { configured: false };
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "Transcribe this phone call verbatim into clean, readable text. Put each speaker turn on its own line and label it 'Agent:' or 'Seller:' when you can tell who is speaking (best guess is fine). Do not summarize, add commentary, or omit anything. Output ONLY the transcript.",
                },
                { inlineData: { mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { configured: true, error: `Transcription failed (${res.status}). ${body.slice(0, 160)}` };
    }
    const data = await res.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).filter(Boolean).join("").trim() ?? "";
    if (!text) return { configured: true, error: "No transcript came back — try a clearer recording." };
    return { configured: true, text };
  } catch {
    return { configured: true, error: "Couldn't reach the transcription service." };
  }
}
