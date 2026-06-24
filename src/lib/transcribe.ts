// Transcribe a call recording with Google's Gemini API. Small files (<18 MB) go
// inline; larger files upload via the Gemini File API (up to 2 GB) so long calls
// work. We keep only the returned transcript. Requires GEMINI_API_KEY.

export interface TranscribeResult {
  configured: boolean;
  text?: string;
  error?: string;
}

const INLINE_MAX = 18 * 1024 * 1024; // Gemini inline-request cap (~20 MB total)
const PROMPT =
  "Transcribe this phone call verbatim into clean, readable text. Put each speaker turn on its own line and label it 'Agent:' or 'Seller:' when you can tell who is speaking (best guess is fine). Do not summarize, add commentary, or omit anything. Output ONLY the transcript.";

type AudioPart = { inlineData: { mimeType: string; data: string } } | { fileData: { fileUri: string; mimeType: string } };

export async function transcribeAudio(buf: Buffer, mimeType: string): Promise<TranscribeResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { configured: false };
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  try {
    let audioPart: AudioPart;
    let cleanupName: string | null = null;
    if (buf.byteLength <= INLINE_MAX) {
      audioPart = { inlineData: { mimeType, data: buf.toString("base64") } };
    } else {
      const up = await uploadToGeminiFiles(buf, mimeType, key);
      if ("error" in up) return { configured: true, error: up.error };
      audioPart = { fileData: { fileUri: up.uri, mimeType } };
      cleanupName = up.name; // delete after, to keep the Gemini file store tidy
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, audioPart] }],
          generationConfig: { temperature: 0 },
        }),
      },
    );
    if (cleanupName) fetch(`https://generativelanguage.googleapis.com/v1beta/${cleanupName}?key=${key}`, { method: "DELETE" }).catch(() => {});

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

/** Upload large audio to the Gemini File API (resumable), wait until it's ready. */
async function uploadToGeminiFiles(buf: Buffer, mimeType: string, key: string): Promise<{ uri: string; name: string } | { error: string }> {
  // 1) Start a resumable upload — Gemini returns a one-time upload URL.
  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buf.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "content-type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "call-recording" } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) return { error: `Couldn't start the upload (${start.status}).` };

  // 2) Send the bytes and finalize.
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "content-length": String(buf.byteLength) },
    body: new Uint8Array(buf),
  });
  if (!up.ok) return { error: `Upload failed (${up.status}).` };
  const file = (await up.json())?.file as { uri?: string; name?: string; state?: string } | undefined;
  if (!file?.uri || !file?.name) return { error: "Upload returned no file." };

  // 3) Audio needs a moment to process — poll until ACTIVE.
  let state = file.state;
  for (let i = 0; state === "PROCESSING" && i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${key}`);
    state = (await poll.json())?.state;
  }
  if (state !== "ACTIVE") return { error: `Recording didn't finish processing (${state}).` };
  return { uri: file.uri, name: file.name };
}
